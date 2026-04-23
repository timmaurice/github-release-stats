import { Octokit } from '@octokit/rest'

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
) {
  return await octokit.rest.repos.listReleases({
    owner,
    repo,
    per_page: 30,
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
  return stargazers
}

/**
 * Fetches all issues (open and closed) with timestamps for a repository using pagination.
 */
export async function getIssues(octokit: Octokit, owner: string, repo: string) {
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
  return issues
}
