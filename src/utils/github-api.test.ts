import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from 'bun:test'
import type { Octokit } from '@octokit/rest'
import { clearCache } from './cache'
import {
  getOpenPullRequestsCount,
  getRepoReleases,
  getStargazers,
  parseLastPage,
} from './github-api'

const DAY_MS = 24 * 60 * 60 * 1000

interface ListCall {
  headers?: Record<string, string>
}

/** Minimal Octokit stand-in: only the members the module actually touches. */
function fakeOctokit(parts: {
  listReleases?: (opts: ListCall) => Promise<unknown>
  pullsList?: (opts: ListCall) => Promise<unknown>
  pages?: unknown[][]
}) {
  const calls: ListCall[] = []
  const octokit = {
    rest: {
      repos: {
        listReleases: (opts: ListCall) => {
          calls.push(opts)
          return parts.listReleases!(opts)
        },
      },
      activity: { listStargazersForRepo: 'stargazers-endpoint' },
      issues: { listForRepo: 'issues-endpoint' },
      pulls: {
        list: (opts: ListCall) => {
          calls.push(opts)
          return parts.pullsList!(opts)
        },
      },
    },
    paginate: {
      iterator: async function* () {
        for (const page of parts.pages ?? []) {
          yield { data: page }
        }
      },
    },
  }
  return { octokit: octokit as unknown as Octokit, calls }
}

beforeEach(async () => {
  await clearCache()
})

afterEach(() => {
  setSystemTime()
})

describe('parseLastPage', () => {
  it('reads the last page from a Link header', () => {
    const link =
      '<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=57>; rel="last"'
    expect(parseLastPage(link)).toBe(57)
  })

  it('matches when page is the first query parameter', () => {
    expect(
      parseLastPage('<https://api.github.com/x?page=9&per_page=1>; rel="last"')
    ).toBe(9)
  })

  it('returns null when there is no last link', () => {
    expect(parseLastPage(undefined)).toBeNull()
    expect(
      parseLastPage('<https://api.github.com/x?page=2>; rel="next"')
    ).toBeNull()
  })
})

describe('getRepoReleases', () => {
  it('serves the second call from cache without hitting the API', async () => {
    const { octokit, calls } = fakeOctokit({
      listReleases: async () => ({
        data: [{ tag_name: 'v1.0.0' }],
        headers: { etag: 'W/"one"' },
      }),
    })

    expect(await getRepoReleases(octokit, 'acme', 'cached')).toEqual([
      { tag_name: 'v1.0.0' },
    ] as never)
    expect(await getRepoReleases(octokit, 'acme', 'cached')).toEqual([
      { tag_name: 'v1.0.0' },
    ] as never)
    expect(calls).toHaveLength(1)
  })

  it('revalidates a stale entry with If-None-Match and reuses it on 304', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    let responses = 0
    const { octokit, calls } = fakeOctokit({
      listReleases: async (opts) => {
        responses++
        if (opts.headers?.['if-none-match']) {
          throw Object.assign(new Error('Not Modified'), { status: 304 })
        }
        return {
          data: [{ tag_name: 'v2.0.0' }],
          headers: { etag: 'W/"two"' },
        }
      },
    })

    await getRepoReleases(octokit, 'acme', 'revalidated')

    setSystemTime(new Date(Date.now() + DAY_MS + 1000))
    const second = await getRepoReleases(octokit, 'acme', 'revalidated')

    expect(second).toEqual([{ tag_name: 'v2.0.0' }] as never)
    expect(responses).toBe(2)
    expect(calls[1]?.headers?.['if-none-match']).toBe('W/"two"')

    // A confirmed entry is fresh again, so the next call skips the network.
    await getRepoReleases(octokit, 'acme', 'revalidated')
    expect(responses).toBe(2)
  })

  it('replaces the cached payload when the etag no longer matches', async () => {
    setSystemTime(new Date('2026-02-01T00:00:00Z'))
    const { octokit } = fakeOctokit({
      listReleases: async (opts) => ({
        data: opts.headers?.['if-none-match']
          ? [{ tag_name: 'v3.1.0' }]
          : [{ tag_name: 'v3.0.0' }],
        headers: { etag: 'W/"three"' },
      }),
    })

    await getRepoReleases(octokit, 'acme', 'changed')
    setSystemTime(new Date(Date.now() + DAY_MS + 1000))

    expect(await getRepoReleases(octokit, 'acme', 'changed')).toEqual([
      { tag_name: 'v3.1.0' },
    ] as never)
  })

  it('propagates errors that are not 304', async () => {
    const { octokit } = fakeOctokit({
      listReleases: async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 })
      },
    })

    await expect(getRepoReleases(octokit, 'acme', 'missing')).rejects.toThrow(
      'Not Found'
    )
  })
})

describe('getStargazers', () => {
  const page = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ starred_at: `2026-01-${i + 1}` }))

  it('reports truncated when it stops on a full page at the cap', async () => {
    const { octokit } = fakeOctokit({
      pages: Array.from({ length: 12 }, () => page(100)),
    })
    const result = await getStargazers(octokit, 'acme', 'popular')

    expect(result.truncated).toBe(true)
    expect(result.data).toHaveLength(1000)
  })

  it('is not truncated when the collection ends before the cap', async () => {
    const { octokit } = fakeOctokit({ pages: [page(100), page(7)] })
    const result = await getStargazers(octokit, 'acme', 'small')

    expect(result.truncated).toBe(false)
    expect(result.data).toHaveLength(107)
  })

  it('is not truncated when the last allowed page is short', async () => {
    const { octokit } = fakeOctokit({
      pages: [...Array.from({ length: 9 }, () => page(100)), page(42)],
    })
    const result = await getStargazers(octokit, 'acme', 'exact')

    expect(result.truncated).toBe(false)
    expect(result.data).toHaveLength(942)
  })

  it('preserves the truncation flag when served from cache', async () => {
    const { octokit } = fakeOctokit({
      pages: Array.from({ length: 12 }, () => page(100)),
    })
    await getStargazers(octokit, 'acme', 'cached-truncation')

    const empty = fakeOctokit({ pages: [] })
    const cached = await getStargazers(
      empty.octokit,
      'acme',
      'cached-truncation'
    )
    expect(cached.truncated).toBe(true)
    expect(cached.data).toHaveLength(1000)
  })
})

describe('getOpenPullRequestsCount', () => {
  it('derives the total from the Link header', async () => {
    const { octokit } = fakeOctokit({
      pullsList: async () => ({
        data: [{ id: 1 }],
        headers: {
          etag: 'W/"prs"',
          link: '<https://api.github.com/x?per_page=1&page=42>; rel="last"',
        },
      }),
    })

    expect(await getOpenPullRequestsCount(octokit, 'acme', 'counted')).toEqual({
      displayCount: 42,
      totalCount: 42,
    })
  })

  it('reports a single page as one open pull request', async () => {
    const { octokit } = fakeOctokit({
      pullsList: async () => ({ data: [{ id: 1 }], headers: {} }),
    })

    expect(await getOpenPullRequestsCount(octokit, 'acme', 'single')).toEqual({
      displayCount: 1,
      totalCount: 1,
    })
  })

  it('reports an empty list as zero', async () => {
    const { octokit } = fakeOctokit({
      pullsList: async () => ({ data: [], headers: {} }),
    })

    expect(await getOpenPullRequestsCount(octokit, 'acme', 'none')).toEqual({
      displayCount: 0,
      totalCount: 0,
    })
  })

  it('counts non-dependabot pull requests separately when filtering', async () => {
    const { octokit } = fakeOctokit({
      pages: [
        [
          { user: { login: 'alice' } },
          { user: { login: 'dependabot[bot]' } },
          { user: { login: 'bob' } },
        ],
      ],
    })

    expect(
      await getOpenPullRequestsCount(octokit, 'acme', 'filtered', true)
    ).toEqual({ displayCount: 2, totalCount: 3 })
  })
})
