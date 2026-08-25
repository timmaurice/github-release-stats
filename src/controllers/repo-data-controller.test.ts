import { beforeEach, describe, expect, it } from 'bun:test'
import type { ReactiveControllerHost } from 'lit'
import type { Octokit } from '@octokit/rest'
import { clearCache } from '../utils/cache'
import { RepoDataController } from './repo-data-controller'

function fakeHost(): ReactiveControllerHost {
  return {
    addController: () => {},
    removeController: () => {},
    requestUpdate: () => {},
    updateComplete: Promise.resolve(true),
  }
}

function release(tag: string, prerelease: boolean, downloads: number) {
  return {
    tag_name: tag,
    prerelease,
    published_at: '2026-01-01T00:00:00Z',
    assets: [{ download_count: downloads }],
  }
}

/** Fails for any repository named in `failures`, succeeds for the rest. */
function fakeOctokit(
  releases: Record<string, ReturnType<typeof release>[]>,
  failures: Record<string, number> = {}
) {
  const guard = (repo: string) => {
    const status = failures[repo]
    if (status) throw Object.assign(new Error(`HTTP ${status}`), { status })
  }
  return {
    rest: {
      repos: {
        listReleases: async ({ repo }: { repo: string }) => {
          guard(repo)
          return { data: releases[repo] ?? [], headers: {} }
        },
        get: async ({ repo }: { repo: string }) => {
          guard(repo)
          return {
            data: {
              stargazers_count: 10,
              pushed_at: '2026-01-01T00:00:00Z',
              size: 100,
              open_issues_count: 3,
            },
            headers: {},
          }
        },
      },
      pulls: {
        list: async ({ repo }: { repo: string }) => {
          guard(repo)
          return { data: [], headers: {} }
        },
      },
    },
    paginate: {
      iterator: async function* () {},
    },
  } as unknown as Octokit
}

function makeController(
  octokit: Octokit,
  { hidePreReleases = false } = {}
): RepoDataController {
  return new RepoDataController(fakeHost(), {
    getOctokit: () => octokit,
    getFilterDependabot: () => false,
    getHidePreReleases: () => hidePreReleases,
    t: (key) => key, // assert on keys, not on translated copy
    onOrderChange: () => {},
  })
}

beforeEach(async () => {
  await clearCache()
})

describe('pre-release filtering', () => {
  const releases = {
    widget: [
      release('2.4.0b2', true, 5),
      release('2.4.0b1', true, 3),
      release('2.3.1', false, 100),
    ],
  }

  it('counts pre-releases when the option is off', async () => {
    const controller = makeController(fakeOctokit(releases))
    controller.setRepos([{ username: 'acme', repository: 'widget' }])
    await controller.fetchAll()

    const summary = controller.summaryData[0]
    expect(summary?.latestVersion).toBe('2.4.0b2')
    expect(summary?.totalDownloads).toBe(108)
    expect(controller.releasesData.get('acme/widget')).toHaveLength(3)
  })

  it('drops pre-releases from the version, the totals and the release list', async () => {
    const controller = makeController(fakeOctokit(releases), {
      hidePreReleases: true,
    })
    controller.setRepos([{ username: 'acme', repository: 'widget' }])
    await controller.fetchAll()

    const summary = controller.summaryData[0]
    expect(summary?.latestVersion).toBe('2.3.1')
    expect(summary?.totalDownloads).toBe(100)
    expect(controller.releasesData.get('acme/widget')).toHaveLength(1)
  })

  it('reports no version when every release is a pre-release', async () => {
    const controller = makeController(
      fakeOctokit({ beta: [release('1.0.0rc1', true, 9)] }),
      { hidePreReleases: true }
    )
    controller.setRepos([{ username: 'acme', repository: 'beta' }])
    await controller.fetchAll()

    expect(controller.summaryData[0]?.latestVersion).toBe('common.notAvailable')
    expect(controller.summaryData[0]?.totalDownloads).toBe(0)
  })
})

describe('per-repository failures', () => {
  it('keeps the repositories that loaded when one of them fails', async () => {
    const controller = makeController(
      fakeOctokit({ good: [release('1.0.0', false, 7)] }, { gone: 404 })
    )
    controller.setRepos([
      { username: 'acme', repository: 'good' },
      { username: 'acme', repository: 'gone' },
    ])
    await controller.fetchAll()

    expect(controller.summaryData.map((s) => s.identifier)).toEqual([
      'acme/good',
    ])
    expect(controller.repoErrors.get('acme/gone')).toBe('errors.repoNotFound')
    expect(controller.failedIdentifiers).toEqual(['acme/gone'])
    expect(controller.order).toEqual(['acme/good'])
  })

  it('reports a rejected token as a credential problem, not a rate limit', async () => {
    const controller = makeController(fakeOctokit({}, { locked: 401 }))
    controller.setRepos([{ username: 'acme', repository: 'locked' }])
    await controller.fetchAll()

    expect(controller.repoErrors.get('acme/locked')).toBe('errors.invalidToken')
  })

  it('reports a plain 403 as forbidden rather than an exhausted quota', async () => {
    const controller = makeController(fakeOctokit({}, { private: 403 }))
    controller.setRepos([{ username: 'acme', repository: 'private' }])
    await controller.fetchAll()

    expect(controller.repoErrors.get('acme/private')).toBe(
      'errors.repoForbidden'
    )
  })

  it('clears earlier failures on a successful refetch', async () => {
    const controller = makeController(fakeOctokit({}, { flaky: 404 }))
    controller.setRepos([{ username: 'acme', repository: 'flaky' }])
    await controller.fetchAll()
    expect(controller.repoErrors.size).toBe(1)

    const recovered = makeController(
      fakeOctokit({ flaky: [release('1.0.0', false, 1)] })
    )
    recovered.setRepos([{ username: 'acme', repository: 'flaky' }])
    await recovered.fetchAll()
    expect(recovered.repoErrors.size).toBe(0)
  })
})
