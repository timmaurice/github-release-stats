import { Octokit } from '@octokit/rest'
import type {
  GitHubRelease,
  IssueActivity,
  PagedResult,
  PullRequestActivity,
  Stargazer,
} from '../types'
import { getCache, setCache, touchCache } from './cache'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const PER_PAGE = 100

/** How many pages of history we are willing to pull for one repository. */
const MAX_HISTORY_PAGES = 10

type ResponseWithEtag<T> = {
  data: T
  headers: { etag?: string }
}

/**
 * GitHub answers a conditional request with 304 when nothing changed, and
 * Octokit surfaces that as a thrown error rather than a response.
 */
function isNotModified(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 304
  )
}

function conditionalHeaders(etag?: string) {
  return etag ? { 'if-none-match': etag } : undefined
}

/**
 * Caches a single-request endpoint and revalidates it with the stored ETag once
 * the entry goes stale. A 304 costs nothing against the rate limit, so an
 * unchanged repository is effectively free to re-check.
 */
async function cachedWithEtag<T>(
  cacheKey: string,
  request: (etag?: string) => Promise<ResponseWithEtag<T>>
): Promise<T> {
  const cached = await getCache<T>(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  try {
    const response = await request(cached?.etag)
    await setCache(cacheKey, response.data, { etag: response.headers.etag })
    return response.data
  } catch (error) {
    if (isNotModified(error) && cached) {
      await touchCache(cacheKey)
      return cached.data
    }
    throw error
  }
}

/**
 * Caches a paginated collection, preserving whether it had to be cut short.
 * These endpoints span many requests, so a single ETag cannot describe them.
 */
async function cachedPages<T>(
  cacheKey: string,
  fetchAll: () => Promise<PagedResult<T>>
): Promise<PagedResult<T>> {
  const cached = await getCache<T[]>(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { data: cached.data, truncated: cached.truncated === true }
  }

  const result = await fetchAll()
  await setCache(cacheKey, result.data, { truncated: result.truncated })
  return result
}

/**
 * Drains a paginated iterator up to `MAX_HISTORY_PAGES`. A full final page at
 * the cap means GitHub still had more to give, which is reported as truncated.
 */
async function collectPages<TPage, TItem>(
  iterator: AsyncIterable<{ data: TPage[] }>,
  map: (page: TPage[]) => TItem[]
): Promise<PagedResult<TItem>> {
  const items: TItem[] = []
  let pages = 0
  let lastPageSize = 0

  for await (const { data } of iterator) {
    items.push(...map(data))
    lastPageSize = data.length
    pages++
    if (pages >= MAX_HISTORY_PAGES) break
  }

  return {
    data: items,
    truncated: pages >= MAX_HISTORY_PAGES && lastPageSize === PER_PAGE,
  }
}

/**
 * Fetches the user data by username.
 */
export async function getUserByUsername(octokit: Octokit, username: string) {
  const { data } = await octokit.rest.users.getByUsername({ username })
  return data
}

/**
 * Fetches all public repositories for a user using pagination.
 */
export async function listUserRepos(octokit: Octokit, username: string) {
  return await octokit.paginate(octokit.rest.repos.listForUser, {
    username,
    per_page: PER_PAGE,
  })
}

/**
 * Fetches the latest 30 releases for a repository.
 */
export async function getRepoReleases(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<GitHubRelease[]> {
  return cachedWithEtag(`releases-${owner}-${repo}`, async (etag) => {
    const response = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 30,
      headers: conditionalHeaders(etag),
    })
    return {
      data: response.data as unknown as GitHubRelease[],
      headers: response.headers,
    }
  })
}

/**
 * Fetches details for a specific repository.
 */
export async function getRepoDetails(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  return cachedWithEtag(`repo-details-${owner}-${repo}`, async (etag) => {
    const response = await octokit.rest.repos.get({
      owner,
      repo,
      headers: conditionalHeaders(etag),
    })
    return { data: response.data, headers: response.headers }
  })
}

/**
 * Fetches stargazers with timestamps for a repository using pagination.
 */
export async function getStargazers(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PagedResult<Stargazer>> {
  return cachedPages(`stargazers-${owner}-${repo}`, () =>
    collectPages(
      // The star+json media type swaps the plain user payload for one carrying
      // `starred_at`, which the generated response types do not narrow to.
      octokit.paginate.iterator(octokit.rest.activity.listStargazersForRepo, {
        owner,
        repo,
        per_page: PER_PAGE,
        headers: {
          accept: 'application/vnd.github.star+json',
        },
      }) as AsyncIterable<{ data: Stargazer[] }>,
      (page) => page
    )
  )
}

/**
 * Fetches issues (open and closed) with timestamps for a repository.
 */
export async function getIssues(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PagedResult<IssueActivity>> {
  return cachedPages(`issues-${owner}-${repo}`, () =>
    collectPages(
      octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        per_page: PER_PAGE,
        state: 'all', // we need both open and closed to track over time
      }),
      // The response contains pull requests as well, we should filter them out.
      (page) =>
        page
          .filter((issue) => !issue.pull_request)
          .map((issue) => ({
            created_at: issue.created_at,
            closed_at: issue.closed_at || null,
          }))
    )
  )
}

/**
 * Fetches pull requests (open and closed) with timestamps for a repository.
 */
export async function getPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PagedResult<PullRequestActivity>> {
  return cachedPages(`prs-${owner}-${repo}`, () =>
    collectPages(
      octokit.paginate.iterator(octokit.rest.pulls.list, {
        owner,
        repo,
        per_page: PER_PAGE,
        state: 'all',
      }),
      (page) =>
        page.map((pr) => ({
          created_at: pr.created_at,
          closed_at: pr.closed_at || null,
          author: pr.user?.login || '',
        }))
    )
  )
}

/**
 * Reads the last page number out of a Link header, which is how GitHub lets us
 * count a collection without downloading it.
 */
export function parseLastPage(link: string | undefined): number | null {
  if (!link) return null
  const match = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  return match?.[1] ? parseInt(match[1], 10) : null
}

/**
 * Fetches the total count of open pull requests for a repository efficiently using pagination headers.
 */
export async function getOpenPullRequestsCount(
  octokit: Octokit,
  owner: string,
  repo: string,
  filterDependabot: boolean = false
): Promise<{ displayCount: number; totalCount: number }> {
  const cacheKey = `open-prs-counts-${owner}-${repo}-${filterDependabot}`

  if (filterDependabot) {
    // When filtering dependabot, we must fetch the open PRs to inspect the author.
    const cached = await getCache<{ displayCount: number; totalCount: number }>(
      cacheKey
    )
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data
    }

    let displayCount = 0
    let totalCount = 0
    const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: PER_PAGE,
    })

    for await (const { data: pageData } of iterator) {
      const nonDependabotPRs = pageData.filter(
        (pr) => pr.user?.login !== 'dependabot[bot]'
      )
      displayCount += nonDependabotPRs.length
      totalCount += pageData.length
    }

    const result = { displayCount, totalCount }
    await setCache(cacheKey, result)
    return result
  }

  // If not filtering, we can use the highly-optimized headers method.
  return cachedWithEtag(cacheKey, async (etag) => {
    const response = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 1,
      headers: conditionalHeaders(etag),
    })

    const totalCount =
      response.data.length === 0
        ? 0
        : (parseLastPage(response.headers.link) ?? 1)

    return {
      data: { displayCount: totalCount, totalCount },
      headers: response.headers,
    }
  })
}
