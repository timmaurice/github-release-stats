import type { RestEndpointMethodTypes } from '@octokit/rest'
import { Octokit } from '@octokit/rest'
import { getCache, setCache } from './cache'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

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
    per_page: 100,
  })
}

/**
 * Fetches the latest 30 releases for a repository.
 */
export async function getRepoReleases(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RestEndpointMethodTypes['repos']['listReleases']['response']> {
  const cacheKey = `releases-${owner}-${repo}`
  const cached =
    await getCache<
      RestEndpointMethodTypes['repos']['listReleases']['response']
    >(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const response = await octokit.rest.repos.listReleases({
    owner,
    repo,
    per_page: 30,
  })
  await setCache(cacheKey, response)
  return response
}

/**
 * Fetches details for a specific repository.
 */
export async function getRepoDetails(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  return await octokit.rest.repos.get({
    owner,
    repo,
  })
}

/**
 * Fetches all stargazers with timestamps for a repository using pagination.
 */
export async function getStargazers(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  const cacheKey = `stargazers-${owner}-${repo}`
  const cached = await getCache<{ starred_at: string }[]>(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const stargazers: { starred_at: string }[] = []
  const iterator = octokit.paginate.iterator(
    octokit.rest.activity.listStargazersForRepo,
    {
      owner,
      repo,
      per_page: 100,
      headers: {
        accept: 'application/vnd.github.star+json',
      },
    }
  )

  let pageCount = 0
  const MAX_STARGAZER_PAGES = 10 // Fetch up to 1000 stars to avoid hitting rate limits on very popular repos.

  for await (const { data: pageData } of iterator) {
    const typedPageData = pageData as { starred_at: string }[]
    stargazers.push(...typedPageData)
    pageCount++
    if (pageCount >= MAX_STARGAZER_PAGES) {
      break
    }
  }

  await setCache(cacheKey, stargazers)
  return stargazers
}

/**
 * Fetches all issues (open and closed) with timestamps for a repository using pagination.
 */
export async function getIssues(octokit: Octokit, owner: string, repo: string) {
  const cacheKey = `issues-${owner}-${repo}`
  const cached =
    await getCache<{ created_at: string; closed_at: string | null }[]>(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const issues: { created_at: string; closed_at: string | null }[] = []
  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    per_page: 100,
    state: 'all', // we need both open and closed to track over time
  })

  let pageCount = 0
  const MAX_ISSUE_PAGES = 10

  for await (const { data: pageData } of iterator) {
    // The response contains pull requests as well, we should filter them out.
    const issuesOnly = pageData.filter((issue) => !issue.pull_request)
    issues.push(
      ...issuesOnly.map((i) => ({
        created_at: i.created_at,
        closed_at: i.closed_at || null,
      }))
    )
    pageCount++
    if (pageCount >= MAX_ISSUE_PAGES) {
      break
    }
  }

  await setCache(cacheKey, issues)
  return issues
}
