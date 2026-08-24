import type { ReactiveControllerHost } from 'lit'
import type { Octokit } from '@octokit/rest'
import type { RepoSummary, SortKey } from '../components/summary-table'
import type {
  GitHubRelease,
  IssueActivity,
  PullRequestActivity,
  Stargazer,
  TruncatedDataset,
} from '../types'
import {
  getIssues,
  getOpenPullRequestsCount,
  getPullRequests,
  getRepoDetails,
  getRepoReleases,
  getStargazers,
} from '../utils/github-api'

export interface RepoRef {
  username: string
  repository: string
}

export interface RepoDataOptions {
  getOctokit: () => Octokit
  getFilterDependabot: () => boolean
  t: (key: string, replacements?: Record<string, string | number>) => string
  /** Called whenever the display order changes, so the host can sync the URL. */
  onOrderChange: () => void
}

export function repoIdentifier(repo: RepoRef): string {
  return `${repo.username}/${repo.repository}`
}

export function parseIdentifier(identifier: string): RepoRef | null {
  const [username, repository] = identifier.split('/')
  return username && repository ? { username, repository } : null
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

/**
 * Owns the repository list and everything fetched for it. Failures are tracked
 * per repository so one bad entry cannot blank out the whole dashboard, and
 * incomplete history is flagged rather than silently charted.
 */
export class RepoDataController {
  private host: ReactiveControllerHost
  private options: RepoDataOptions

  repos: RepoRef[] = []
  releasesData: Map<string, GitHubRelease[]> = new Map()
  downloadsData: Map<string, number> = new Map()
  stargazersData: Map<string, Stargazer[]> = new Map()
  issuesData: Map<string, IssueActivity[]> = new Map()
  pullRequestsData: Map<string, PullRequestActivity[]> = new Map()
  summaryData: RepoSummary[] = []
  order: string[] = []
  sortKey: SortKey = 'totalDownloads'
  sortDirection: 'asc' | 'desc' = 'desc'
  loading = false
  error = ''

  /** Per-repository failure messages, keyed by `owner/name`. */
  repoErrors: Map<string, string> = new Map()
  /** Which series had to be cut short, keyed by `owner/name`. */
  truncated: Map<string, Set<TruncatedDataset>> = new Map()

  constructor(host: ReactiveControllerHost, options: RepoDataOptions) {
    this.host = host
    this.options = options
  }

  private notify() {
    this.host.requestUpdate()
  }

  get identifiers(): string[] {
    return this.repos.map(repoIdentifier)
  }

  get failedIdentifiers(): string[] {
    return [...this.repoErrors.keys()]
  }

  /** Identifiers whose charts are drawn from an incomplete history. */
  get truncatedIdentifiers(): string[] {
    return [...this.truncated.entries()]
      .filter(([, datasets]) => datasets.size > 0)
      .map(([identifier]) => identifier)
  }

  has(repo: RepoRef): boolean {
    const identifier = repoIdentifier(repo)
    return this.identifiers.includes(identifier)
  }

  setRepos(repos: RepoRef[]) {
    this.repos = repos
    this.notify()
  }

  add(repo: RepoRef): boolean {
    if (this.has(repo)) return false
    this.repos = [...this.repos, repo]
    this.notify()
    return true
  }

  remove(identifier: string) {
    this.repos = this.repos.filter((r) => repoIdentifier(r) !== identifier)
    this.order = this.order.filter((id) => id !== identifier)
    this.summaryData = this.summaryData.filter(
      (d) => d.identifier !== identifier
    )
    this.releasesData = new Map(this.releasesData)
    this.downloadsData = new Map(this.downloadsData)
    this.stargazersData = new Map(this.stargazersData)
    this.issuesData = new Map(this.issuesData)
    this.pullRequestsData = new Map(this.pullRequestsData)
    this.releasesData.delete(identifier)
    this.downloadsData.delete(identifier)
    this.stargazersData.delete(identifier)
    this.issuesData.delete(identifier)
    this.pullRequestsData.delete(identifier)
    this.repoErrors.delete(identifier)
    this.truncated.delete(identifier)
    this.notify()
  }

  clear() {
    this.repos = []
    this.releasesData = new Map()
    this.downloadsData = new Map()
    this.stargazersData = new Map()
    this.issuesData = new Map()
    this.pullRequestsData = new Map()
    this.summaryData = []
    this.order = []
    this.repoErrors = new Map()
    this.truncated = new Map()
    this.error = ''
    this.notify()
  }

  /** Drops cached history so the next access refetches it from GitHub. */
  resetLazyData() {
    this.stargazersData = new Map()
    this.issuesData = new Map()
    this.pullRequestsData = new Map()
    this.truncated = new Map()
    this.notify()
  }

  private markTruncated(identifier: string, dataset: TruncatedDataset) {
    const datasets = this.truncated.get(identifier) ?? new Set()
    datasets.add(dataset)
    this.truncated.set(identifier, datasets)
  }

  private describeFailure(error: unknown): string {
    switch (statusOf(error)) {
      case 404:
        return this.options.t('errors.repoNotFound')
      case 401:
      case 403:
        return this.options.t('errors.rateLimitExceeded')
      default:
        return this.options.t('errors.repoFetchFailed')
    }
  }

  /**
   * Loads the headline data for every repository. Each repository settles on
   * its own, so a deleted or private entry is reported inline while the rest of
   * the dashboard still renders.
   */
  async fetchAll() {
    this.loading = true
    this.error = ''
    this.repoErrors = new Map()
    this.notify()

    const octokit = this.options.getOctokit()
    const filterDependabot = this.options.getFilterDependabot()

    const settled = await Promise.allSettled(
      this.repos.map(async (repo) => {
        const [releases, details, prCounts] = await Promise.all([
          getRepoReleases(octokit, repo.username, repo.repository),
          getRepoDetails(octokit, repo.username, repo.repository),
          getOpenPullRequestsCount(
            octokit,
            repo.username,
            repo.repository,
            filterDependabot
          ),
        ])
        return { repo, releases, details, prCounts }
      })
    )

    const releasesData = new Map<string, GitHubRelease[]>()
    const downloadsData = new Map<string, number>()
    const summaryData: RepoSummary[] = []
    const repoErrors = new Map<string, string>()

    settled.forEach((outcome, index) => {
      const repo = this.repos[index]
      if (!repo) return
      const identifier = repoIdentifier(repo)

      if (outcome.status === 'rejected') {
        console.error(`Failed to load ${identifier}:`, outcome.reason)
        repoErrors.set(identifier, this.describeFailure(outcome.reason))
        return
      }

      const { releases, details, prCounts } = outcome.value
      const published = releases.filter((r) => !!r.published_at)
      releasesData.set(identifier, published)

      const totalDownloads = published.reduce(
        (total, release) =>
          total +
          release.assets.reduce((sum, asset) => sum + asset.download_count, 0),
        0
      )
      downloadsData.set(identifier, totalDownloads)

      summaryData.push({
        identifier,
        stars: details.stargazers_count,
        latestVersion:
          published[0]?.tag_name || this.options.t('common.notAvailable'),
        lastUpdate: details.pushed_at,
        size: details.size,
        totalDownloads,
        openIssues: Math.max(
          0,
          details.open_issues_count - prCounts.totalCount
        ),
        openPullRequests: prCounts.displayCount,
      })
    })

    this.releasesData = releasesData
    this.downloadsData = downloadsData
    this.summaryData = summaryData
    this.repoErrors = repoErrors

    if (this.sortKey !== 'manual') {
      await this.sortBy(this.sortKey, true)
    } else {
      this.order = summaryData.map((s) => s.identifier)
    }

    this.loading = false
    this.notify()
  }

  setManualOrder(order: string[]) {
    this.order = order
    // 'manual' marks the order as user-defined rather than column-driven,
    // which also hides the sort icons.
    this.sortKey = 'manual'
    this.notify()
    this.options.onOrderChange()
  }

  /**
   * Re-orders the dashboard, lazily pulling the history a metric needs.
   */
  async sortBy(key: SortKey, retainDirection = false) {
    if (key === 'manual') return

    let direction = this.sortDirection
    if (!retainDirection) {
      if (this.sortKey === key) {
        direction = this.sortDirection === 'asc' ? 'desc' : 'asc'
      } else {
        // Default to descending for numeric values, ascending for text
        direction =
          key === 'latestVersion' || key === 'lastUpdate' ? 'asc' : 'desc'
      }
    }

    this.sortKey = key
    this.sortDirection = direction

    const sorted = [...this.summaryData].sort((a, b) => {
      let comparison = 0

      if (key === 'latestVersion') {
        const parse = (v: string) =>
          v
            .replace(/^v/i, '')
            .split('.')
            .map((n) => parseInt(n, 10) || 0)
        const partsA = parse(a.latestVersion as string)
        const partsB = parse(b.latestVersion as string)
        const len = Math.max(partsA.length, partsB.length)

        for (let i = 0; i < len; i++) {
          const pA = partsA[i] || 0
          const pB = partsB[i] || 0
          if (pA > pB) {
            comparison = 1
            break
          } else if (pA < pB) {
            comparison = -1
            break
          }
        }
      } else {
        const valA = a[key]
        const valB = b[key]
        if (valA > valB) comparison = 1
        else if (valA < valB) comparison = -1
      }

      return direction === 'asc' ? comparison : -comparison
    })

    this.order = sorted.map((s) => s.identifier)
    this.notify()
    this.options.onOrderChange()

    if (key === 'stars') await this.loadStargazers()
    if (key === 'openIssues') await this.loadIssues()
    if (key === 'openPullRequests') await this.loadPullRequests()
  }

  /**
   * Fetches one lazily-loaded series for every repository still missing it,
   * recording any truncation and surfacing failures as a banner-level error.
   */
  private async loadSeries<T>(
    dataset: TruncatedDataset,
    current: Map<string, T[]>,
    fetcher: (
      octokit: Octokit,
      owner: string,
      repo: string
    ) => Promise<{ data: T[]; truncated: boolean }>,
    errorKey: string,
    assign: (next: Map<string, T[]>) => void
  ) {
    const pending = this.repos.filter(
      (repo) => !current.has(repoIdentifier(repo))
    )
    if (pending.length === 0) return

    this.loading = true
    this.notify()

    const octokit = this.options.getOctokit()
    const settled = await Promise.allSettled(
      pending.map((repo) => fetcher(octokit, repo.username, repo.repository))
    )

    const next = new Map(current)
    let failures = 0

    settled.forEach((outcome, index) => {
      const repo = pending[index]
      if (!repo) return
      const identifier = repoIdentifier(repo)

      if (outcome.status === 'rejected') {
        failures++
        console.error(
          `Failed to load ${dataset} for ${identifier}`,
          outcome.reason
        )
        return
      }

      next.set(identifier, outcome.value.data)
      if (outcome.value.truncated) {
        this.markTruncated(identifier, dataset)
      }
    })

    assign(next)
    if (failures > 0) {
      this.error = this.options.t(errorKey)
    }
    this.loading = false
    this.notify()
  }

  loadStargazers() {
    return this.loadSeries(
      'stars',
      this.stargazersData,
      getStargazers,
      'errors.fetchStarHistory',
      (next) => {
        this.stargazersData = next
      }
    )
  }

  loadIssues() {
    return this.loadSeries(
      'issues',
      this.issuesData,
      getIssues,
      'errors.fetchIssueHistory',
      (next) => {
        this.issuesData = next
      }
    )
  }

  loadPullRequests() {
    return this.loadSeries(
      'pullRequests',
      this.pullRequestsData,
      getPullRequests,
      'errors.fetchPullRequestHistory',
      (next) => {
        this.pullRequestsData = next
      }
    )
  }

  /** Ensures stars and issues are present for a single repository. */
  async loadReportData(identifier: string) {
    const repo = parseIdentifier(identifier)
    if (!repo) return

    const octokit = this.options.getOctokit()

    if (!this.stargazersData.has(identifier)) {
      const stars = await getStargazers(octokit, repo.username, repo.repository)
      this.stargazersData = new Map(this.stargazersData).set(
        identifier,
        stars.data
      )
      if (stars.truncated) this.markTruncated(identifier, 'stars')
    }

    if (!this.issuesData.has(identifier)) {
      const issues = await getIssues(octokit, repo.username, repo.repository)
      this.issuesData = new Map(this.issuesData).set(identifier, issues.data)
      if (issues.truncated) this.markTruncated(identifier, 'issues')
    }

    this.notify()
  }
}
