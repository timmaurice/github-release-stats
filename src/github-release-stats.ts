import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { repeat } from 'lit/directives/repeat.js'
import { trackEvent, trackPageView } from './analytics'
import type { GitHubRelease, BeforeInstallPromptEvent } from './types'
import { Octokit } from '@octokit/rest'
import type { RepoSummary, SortKey } from './components/summary-table'
import { Modal, Dropdown, Collapse } from 'bootstrap'
import Sortable from 'sortablejs'
import { LocalizeController } from './localization/localize-controller'
import { getLocale, setLocale } from './localization/registry'
import {
  generateCsvContent,
  generateMarkdownContent,
  generateSingleRepoMarkdownReport,
  downloadFile,
} from './utils/export-helpers'
import {
  getUserByUsername,
  listUserRepos,
  getRepoReleases,
  getRepoDetails,
  getStargazers,
  getIssues,
  getPullRequests,
  getOpenPullRequestsCount,
} from './utils/github-api'
import { showToast } from './utils/toast'

// Import sub-components
import type { ChartDisplay } from './components/chart-display'
import './components/app-footer'
import './components/app-header'
import './components/loading-spinner'
import './components/settings-modal'
import './components/results-display'
import './components/rate-limit-display'
import './components/summary-table'
import './components/search-form'

import './components/pwa-install-toast'
// Import global styles
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '@fontsource/roboto/index.css'
import './components/index.scss'
@customElement('github-release-stats')
export class GithubReleaseStats extends LitElement {
  private localize = new LocalizeController(this)

  private octokit: Octokit

  private _saveSetModal?: Modal
  private _manageSetsModal?: Modal
  private _confirmModal?: Modal
  private _settingsModal?: Modal | null = null
  private _sortableInstance: Sortable | null = null

  private _storageKey = 'github-release-stats-sets'

  @state() private _newUsername = ''
  @state() private _newRepository = ''

  @state() private _repos: { username: string; repository: string }[] = []
  @state() private _releasesData: Map<string, GitHubRelease[]> = new Map()
  @state() private _downloadsData: Map<string, number> = new Map()
  @state() private _stargazersData: Map<string, { starred_at: string }[]> =
    new Map()
  @state() private _issuesData: Map<
    string,
    { created_at: string; closed_at: string | null }[]
  > = new Map()
  @state() private _pullRequestsData: Map<
    string,
    { created_at: string; closed_at: string | null }[]
  > = new Map()
  @state() private _repoSummaryData: RepoSummary[] = []
  @state() private _repoOrder: string[] = []
  @state() private _chartMetric: SortKey = 'totalDownloads'
  @state() private _sortKey: SortKey = 'totalDownloads'
  @state() private _sortDirection: 'asc' | 'desc' = 'desc'
  @state() private _loading = false
  @state() private _error = ''
  @state() private _authError = ''
  @state() private _repoSuggestions: string[] = []
  @state() private _themeSetting: 'light' | 'dark' | 'auto' = 'auto'
  @state() private _repoCountForConfirm = 0
  @state() private _userForConfirm = ''
  @state() private _githubToken = ''
  @state() private _yAxisScale: 'linear' | 'logarithmic' = 'linear'
  @state() private _suggestionsLoading = false
  @state() private _savedSets: Record<string, string[]> = {}
  @state() private _filterDependabot = false
  @state() private _showTotalDownloads = true
  @state() private _justUpdatedSet: string | null = null

  @state() private _installPrompt: BeforeInstallPromptEvent | null = null
  @state() private _confirmModalTitle = ''
  @state() private _confirmModalBody = ''
  @state() private _confirmAction: (() => void) | null = null

  private get _filteredSuggestions() {
    const currentUsername = this._newUsername.toLowerCase()
    const addedReposForUser = new Set(
      this._repos
        .filter((r) => r.username.toLowerCase() === currentUsername)
        .map((r) => r.repository.toLowerCase())
    )
    return this._repoSuggestions.filter(
      (suggestion) => !addedReposForUser.has(suggestion.toLowerCase())
    )
  }

  constructor() {
    super()
    this._initializeTheme()
    const token = localStorage.getItem('github-token') || ''
    this._githubToken = token
    this.octokit = new Octokit({ auth: token || undefined })

    const savedFilterDependabot = localStorage.getItem('filterDependabot')
    if (savedFilterDependabot !== null) {
      this._filterDependabot = savedFilterDependabot === 'true'
    }

    const savedShowTotalDownloads = localStorage.getItem('showTotalDownloads')
    if (savedShowTotalDownloads !== null) {
      this._showTotalDownloads = savedShowTotalDownloads === 'true'
    }

    // If downloads are hidden, don't use it as the default chart/sort metric
    if (!this._showTotalDownloads && this._sortKey === 'totalDownloads') {
      this._sortKey = 'size'
      this._chartMetric = 'size'
    }

    this._loadSetsFromStorage()
  }

  connectedCallback(): void {
    super.connectedCallback()
    this._readStateFromURL()
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', this._handleSystemThemeChange)

    window.addEventListener(
      'beforeinstallprompt',
      this._handleBeforeInstallPrompt
    )

    window.addEventListener('popstate', this._handlePopState)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    window.removeEventListener('popstate', this._handlePopState)
    window.removeEventListener(
      'beforeinstallprompt',
      this._handleBeforeInstallPrompt
    )
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', this._handleSystemThemeChange)
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('_repos') && this._repos.length > 0) {
      import('./components/chart-display').catch(console.error)
    }

    const saveModalEl = this.querySelector('#saveSetModal')
    if (saveModalEl && !this._saveSetModal) {
      this._saveSetModal = new Modal(saveModalEl)
    }
    const manageModalEl = this.querySelector('#manageSetsModal')
    if (manageModalEl && !this._manageSetsModal) {
      this._manageSetsModal = new Modal(manageModalEl)
    }
    const confirmModalEl = this.querySelector('#confirmModal')
    if (confirmModalEl && !this._confirmModal) {
      this._confirmModal = new Modal(confirmModalEl)
    }
    const settingsModalEl = this.querySelector('#settingsModal')
    if (settingsModalEl && !this._settingsModal) {
      this._settingsModal = new Modal(settingsModalEl)
    }

    this.querySelectorAll('[data-bs-toggle="dropdown"]').forEach((el) =>
      Dropdown.getOrCreateInstance(el)
    )

    this.querySelectorAll('.accordion-collapse').forEach((collapseEl) => {
      // Avoid re-initializing
      if (!Collapse.getInstance(collapseEl)) {
        new Collapse(collapseEl, { toggle: false })
      }
    })

    // Initialize SortableJS for repo pills
    const pillsContainer = this.querySelector('#repo-pills-container')
    if (pillsContainer && !this._sortableInstance) {
      this._sortableInstance = new Sortable(pillsContainer as HTMLElement, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        fallbackClass: 'sortable-fallback',
        forceFallback: true, // Forces custom drag image to allow rotation
        fallbackOnBody: true, // Appends the dragged clone to body so it isn't clipped by hidden overflows
        onEnd: (evt) => {
          if (
            evt.oldIndex !== undefined &&
            evt.newIndex !== undefined &&
            evt.oldIndex !== evt.newIndex
          ) {
            // Read the final order directly from the DOM as determined by SortableJS
            const newOrder = Array.from(evt.target.children)
              .map((item) => (item as HTMLElement).dataset.identifier)
              .filter(Boolean) as string[]

            this._setNewOrder(newOrder)
          }
        },
      })
    } else if (!pillsContainer && this._sortableInstance) {
      // Cleanup if the container is removed
      this._sortableInstance.destroy()
      this._sortableInstance = null
    }
  }

  private _initializeTheme() {
    const savedTheme = localStorage.getItem('theme')
    if (
      savedTheme === 'light' ||
      savedTheme === 'dark' ||
      savedTheme === 'auto'
    ) {
      this._themeSetting = savedTheme
    } else {
      this._themeSetting = 'auto'
      if (savedTheme !== null) {
        localStorage.removeItem('theme') // clear invalid values
      }
    }
    this._applyTheme()
  }

  private _applyTheme() {
    let actualTheme = this._themeSetting
    if (actualTheme === 'auto') {
      actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    document.documentElement.setAttribute('data-bs-theme', actualTheme)
  }

  private _handleBeforeInstallPrompt = (e: Event) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault()

    // Check if the user dismissed the prompt recently (e.g. within the last 7 days)
    const dismissedAt = localStorage.getItem('pwa-dismissed')
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10)
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - dismissedTime < SEVEN_DAYS) {
        return // Do not show the prompt if dismissed recently
      }
    }

    // Stash the event so it can be triggered later.
    this._installPrompt = e as BeforeInstallPromptEvent
  }

  private _handlePwaDismiss = () => {
    this._installPrompt = null
    localStorage.setItem('pwa-dismissed', Date.now().toString())
  }

  private _handleSystemThemeChange = () => {
    // Re-apply theme if we are using "auto"
    if (this._themeSetting === 'auto') {
      this._applyTheme()
    }
  }

  private _readStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search)
    let reposFromUrl = urlParams.get('repos')?.split(',')

    if (!reposFromUrl && !window.location.search) {
      const defaultDashboard = localStorage.getItem('default-dashboard')
      if (defaultDashboard) {
        try {
          reposFromUrl = JSON.parse(defaultDashboard)
        } catch (e) {
          console.error('Failed to parse default dashboard', e)
        }
      }
    }

    const parsedRepos = (reposFromUrl || [])
      .map((r) => {
        const [username, repository] = r.split('/')
        return username && repository ? { username, repository } : null
      })
      .filter((r): r is { username: string; repository: string } => r !== null)

    const newRepoOrder = parsedRepos.map((r) => `${r.username}/${r.repository}`)
    // Avoid re-fetching if the URL state exactly matches our current UI state
    if (newRepoOrder.join(',') === this._repoOrder.join(',')) {
      return
    }

    this._repos = parsedRepos

    if (this._repos.length > 0) {
      this._fetchDataForRepos()
    } else {
      // Silently clear all state if the URL was emptied (e.g. hitting back button to initial state)
      this._releasesData = new Map()
      this._downloadsData = new Map()
      this._stargazersData = new Map()
      this._issuesData = new Map()
      this._repoSummaryData = []
      this._repoOrder = []
    }
  }

  private _handlePopState = () => {
    this._readStateFromURL()
  }

  private _updateURL() {
    const url = new URL(window.location.href)
    // _repoOrder is the source of truth for the display order.
    // Use it to construct the URL so the order is preserved.
    if (this._repoOrder.length > 0) {
      url.searchParams.set('repos', this._repoOrder.join(','))
    } else {
      url.searchParams.delete('repos') // Clear if no repos
    }
    history.pushState({}, '', url)
    // Track the URL change as a page view in our SPA
    trackPageView()
  }

  private _loadSetsFromStorage() {
    const setsJson = localStorage.getItem(this._storageKey)
    if (setsJson) {
      try {
        this._savedSets = JSON.parse(setsJson)
      } catch (e) {
        console.error('Failed to parse saved sets from localStorage', e)
        this._savedSets = {}
      }
    }
  }

  private _saveSetsToStorage() {
    localStorage.setItem(this._storageKey, JSON.stringify(this._savedSets))
  }

  private async _getUserRepos(username: string) {
    if (!username) return

    // When we fetch, we no longer need the confirmation message
    this._repoCountForConfirm = 0
    this._userForConfirm = ''

    this._suggestionsLoading = true

    try {
      const repos = await listUserRepos(this.octokit, username)
      this._repoSuggestions = repos.map((repo) => repo.name)
    } catch (error) {
      console.error('Failed to fetch user repos:', error)
      this._repoSuggestions = []
    } finally {
      this._suggestionsLoading = false
    }
  }

  private async _fetchDataForRepos() {
    this._loading = true
    this._error = ''

    const fetchPromises = this._repos.map(({ username, repository }) => {
      const releasesPromise = getRepoReleases(
        this.octokit,
        username,
        repository
      )
      const repoDetailsPromise = getRepoDetails(
        this.octokit,
        username,
        repository
      )
      const prCountPromise = getOpenPullRequestsCount(
        this.octokit,
        username,
        repository,
        this._filterDependabot
      )
      return Promise.all([releasesPromise, repoDetailsPromise, prCountPromise])
    })

    try {
      const results = await Promise.all(fetchPromises)
      const newReleasesData = new Map<string, GitHubRelease[]>()
      const newDownloadsData = new Map<string, number>()
      const newSummaryData: RepoSummary[] = []

      results.forEach(
        ([releasesResponse, repoDetailsResponse, prCounts], index) => {
          const repo = this._repos[index]
          if (repo) {
            const repoIdentifier = `${repo.username}/${repo.repository}`
            const releases = releasesResponse.data.filter(
              (r): r is typeof r & { published_at: string } => !!r.published_at
            )
            const repoDetails = repoDetailsResponse.data

            newReleasesData.set(repoIdentifier, releases)

            const totalDownloads = releases.reduce(
              (total, release) =>
                total +
                release.assets.reduce(
                  (sum, asset) => sum + asset.download_count,
                  0
                ),
              0
            )
            newDownloadsData.set(repoIdentifier, totalDownloads)

            newSummaryData.push({
              identifier: repoIdentifier,
              stars: repoDetails.stargazers_count,
              latestVersion:
                releases[0]?.tag_name || this.localize.t('common.notAvailable'),
              lastUpdate: repoDetails.pushed_at,
              size: repoDetails.size,
              totalDownloads: totalDownloads,
              openIssues: Math.max(
                0,
                repoDetails.open_issues_count - prCounts.totalCount
              ),
              openPullRequests: prCounts.displayCount,
            })
          }
        }
      )

      this._releasesData = newReleasesData
      this._downloadsData = newDownloadsData
      this._repoSummaryData = newSummaryData

      if (this._sortKey !== 'manual') {
        // Just trigger a sort without flipping direction
        this._handleRequestSort(
          new CustomEvent('request-sort', { detail: this._sortKey }),
          true
        )
      } else {
        // Initialize the display order based on manual order
        this._repoOrder = this._repos.map(
          (r) => `${r.username}/${r.repository}`
        )
      }
    } catch (error) {
      this._error = this.localize.t('errors.fetchRepoData')
      console.error(error)
    } finally {
      this._loading = false
    }
  }

  // Event Handlers from sub-components
  private _handleUsernameInput(e: CustomEvent) {
    this._newUsername = e.detail
  }

  private _handleRepoInput(e: CustomEvent) {
    this._newRepository = e.detail
  }

  private async _handleUsernameChange() {
    if (!this._newUsername) return

    // Reset previous state
    this._repoCountForConfirm = 0
    this._userForConfirm = ''
    this._repoSuggestions = []
    this._error = '' // Clear previous errors

    try {
      const userData = await getUserByUsername(this.octokit, this._newUsername)
      const repoCount = userData.public_repos

      const SUGGESTION_THRESHOLD = 50

      if (repoCount > SUGGESTION_THRESHOLD) {
        this._repoCountForConfirm = repoCount
        this._userForConfirm = this._newUsername
      } else if (repoCount > 0) {
        this._getUserRepos(this._newUsername)
      }
    } catch (error: unknown) {
      console.error('Failed to fetch user data:', error)
      if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = (error as { status: number }).status
        if (status === 403) {
          this._error = this.localize.t('errors.rateLimitExceeded')
        } else if (status === 404) {
          // User not found, fail silently by not setting an error message.
          this._repoSuggestions = []
        } else {
          this._error = this.localize.t('errors.networkError')
        }
      }
    }
  }

  private async _handleFormSubmit() {
    if (!this._newUsername || !this._newRepository) return

    const newRepo = {
      username: this._newUsername,
      repository: this._newRepository,
    }
    // Avoid adding duplicates
    if (
      !this._repos.some(
        (r) =>
          r.username === newRepo.username && r.repository === newRepo.repository
      )
    ) {
      this._repos = [...this._repos, newRepo]
      trackEvent('add_repository', {
        event_category: 'engagement',
        event_label: `${newRepo.username}/${newRepo.repository}`,
      })
      // Await the data fetch to ensure repoOrder is updated before the URL
      await this._fetchDataForRepos()
      this._updateURL()
    }

    // Reset form
    this._newRepository = ''
    // Do not clear suggestions, as they are still valid for the current user.
    // this._repoSuggestions = []
  }

  private _handleRemoveRepo(repoToRemove: {
    username: string
    repository: string
  }) {
    const repoIdentifier = `${repoToRemove.username}/${repoToRemove.repository}`
    this._repos = this._repos.filter(
      (r) => `${r.username}/${r.repository}` !== repoIdentifier
    )
    this._repoOrder = this._repoOrder.filter((id) => id !== repoIdentifier)
    this._releasesData.delete(repoIdentifier)
    this._downloadsData.delete(repoIdentifier)
    this._stargazersData.delete(repoIdentifier)
    this._issuesData.delete(repoIdentifier)
    this._stargazersData = new Map(this._stargazersData)
    this._issuesData = new Map(this._issuesData)
    this._repoSummaryData = this._repoSummaryData.filter(
      (d) => d.identifier !== repoIdentifier
    )
    // Trigger a re-render and data update
    this._releasesData = new Map(this._releasesData)
    this._updateURL()
  }

  private _setNewOrder(newOrder: string[]) {
    this._repoOrder = newOrder
    // Set sortKey to 'manual' to indicate that the order is custom
    // and not based on a column sort. This will also hide the sort icons.
    this._sortKey = 'manual'
    this._updateURL()
  }

  private async _handleCopyReport(e: CustomEvent<string>) {
    const identifier = e.detail
    const summary = this._repoSummaryData.find(
      (s) => s.identifier === identifier
    )
    if (!summary) return

    const [username, repository] = identifier.split('/')
    if (!username || !repository) return

    this._loading = true
    try {
      if (!this._stargazersData.has(identifier)) {
        const sg = await getStargazers(this.octokit, username, repository)
        const newData = new Map(this._stargazersData)
        newData.set(identifier, sg)
        this._stargazersData = newData
      }
      if (!this._issuesData.has(identifier)) {
        const iss = await getIssues(this.octokit, username, repository)
        const newData = new Map(this._issuesData)
        newData.set(identifier, iss)
        this._issuesData = newData
      }

      const releases = this._releasesData.get(identifier) || []
      const stargazers = this._stargazersData.get(identifier) || []
      const issues = this._issuesData.get(identifier) || []

      const markdownContent = generateSingleRepoMarkdownReport(
        summary,
        releases,
        stargazers,
        issues
      )

      await navigator.clipboard.writeText(markdownContent)
      showToast(
        this.localize.t('comparison.markdownCopied') ||
          'Markdown copied to clipboard!'
      )
    } catch (err) {
      console.error(err)
      this._error = this.localize.t('errors.fetchRepoData')
    } finally {
      this._loading = false
    }
  }

  private async _handleRequestSort(
    e: CustomEvent<SortKey>,
    retainDirection = false
  ) {
    const newSortKey = e.detail
    this._authError = '' // Clear previous auth errors on any sort attempt

    if (
      (newSortKey === 'stars' ||
        newSortKey === 'openIssues' ||
        newSortKey === 'openPullRequests') &&
      !this._githubToken
    ) {
      this._authError = this.localize.t('errors.authRequired')
      return
    }

    if (newSortKey === 'manual') {
      return
    }
    let newSortDirection: 'asc' | 'desc' = this._sortDirection

    if (!retainDirection) {
      if (this._sortKey === newSortKey) {
        newSortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc'
      } else {
        // Default to descending for numeric values, ascending for text
        newSortDirection =
          newSortKey === 'latestVersion' || newSortKey === 'lastUpdate'
            ? 'asc'
            : 'desc'
      }
    }

    this._sortKey = newSortKey
    this._sortDirection = newSortDirection
    this._chartMetric = newSortKey

    const sorted = [...this._repoSummaryData].sort((a, b) => {
      let comparison = 0

      if (newSortKey === 'latestVersion') {
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
        const valA = a[newSortKey]
        const valB = b[newSortKey]
        if (valA > valB) comparison = 1
        else if (valA < valB) comparison = -1
      }

      return newSortDirection === 'asc' ? comparison : -comparison
    })

    this._repoOrder = sorted.map((s) => s.identifier)
    this._updateURL()

    // Lazy-load stargazer data only when the user sorts by stars
    if (newSortKey === 'stars') {
      const reposToFetch = this._repos.filter((repo) => {
        const repoIdentifier = `${repo.username}/${repo.repository}`
        return !this._stargazersData.has(repoIdentifier)
      })

      if (reposToFetch.length > 0) {
        this._loading = true
        try {
          const stargazerPromises = reposToFetch.map((repo) =>
            getStargazers(this.octokit, repo.username, repo.repository)
          )
          const results = await Promise.all(stargazerPromises)

          const newStargazersData = new Map(this._stargazersData)
          results.forEach((stargazers, index) => {
            const repo = reposToFetch[index]
            if (repo) {
              const repoIdentifier = `${repo.username}/${repo.repository}`
              newStargazersData.set(repoIdentifier, stargazers)
            }
          })
          this._stargazersData = newStargazersData
        } catch (error) {
          console.error('Failed to fetch stargazer data on demand', error)
          this._error = this.localize.t('errors.fetchStarHistory')
        } finally {
          this._loading = false
        }
      }
    }

    if (newSortKey === 'openIssues') {
      const reposToFetch = this._repos.filter((repo) => {
        const repoIdentifier = `${repo.username}/${repo.repository}`
        return !this._issuesData.has(repoIdentifier)
      })

      if (reposToFetch.length > 0) {
        this._loading = true
        try {
          const issuePromises = reposToFetch.map((repo) =>
            getIssues(this.octokit, repo.username, repo.repository)
          )
          const results = await Promise.all(issuePromises)

          const newIssuesData = new Map(this._issuesData)
          results.forEach((issues, index) => {
            const repo = reposToFetch[index]
            if (repo) {
              const repoIdentifier = `${repo.username}/${repo.repository}`
              newIssuesData.set(repoIdentifier, issues)
            }
          })
          this._issuesData = newIssuesData
        } catch (error) {
          console.error('Failed to fetch issue data on demand', error)
          this._error = this.localize.t('errors.fetchIssueHistory')
        } finally {
          this._loading = false
        }
      }
    }

    if (newSortKey === 'openPullRequests') {
      const reposToFetch = this._repos.filter((repo) => {
        const repoIdentifier = `${repo.username}/${repo.repository}`
        return !this._pullRequestsData.has(repoIdentifier)
      })

      if (reposToFetch.length > 0) {
        this._loading = true
        try {
          const prPromises = reposToFetch.map((repo) =>
            getPullRequests(this.octokit, repo.username, repo.repository)
          )
          const results = await Promise.all(prPromises)

          const newPullRequestsData = new Map(this._pullRequestsData)
          results.forEach((prs, index) => {
            const repo = reposToFetch[index]
            if (repo) {
              const repoIdentifier = `${repo.username}/${repo.repository}`
              newPullRequestsData.set(repoIdentifier, prs)
            }
          })
          this._pullRequestsData = newPullRequestsData
        } catch (error) {
          console.error('Failed to fetch PR data on demand', error)
          this._error = this.localize.t('errors.fetchIssueHistory') // Fallback error string
        } finally {
          this._loading = false
        }
      }
    }
  }

  private _handleScaleChange(scale: 'linear' | 'logarithmic') {
    this._yAxisScale = scale
    trackEvent('change_scale', {
      event_category: 'chart_interaction',
      event_label: scale,
    })
  }

  private _handleResetZoom() {
    const chartDisplay = this.querySelector(
      'chart-display'
    ) as ChartDisplay | null
    chartDisplay?.resetZoom()
  }

  private _handleClearAllRepos() {
    const clearAction = () => {
      this._repos = []
      this._releasesData = new Map()
      this._downloadsData = new Map()
      this._stargazersData = new Map()
      this._issuesData = new Map()
      this._repoSummaryData = []
      this._repoOrder = []
      this._error = ''
      this._authError = ''
      // After clearing, update the URL which will also trigger a re-render to the initial state
      trackEvent('clear_all_repos', {
        event_category: 'engagement',
        event_label: 'Clear All',
      })
      this._updateURL()
    }

    this._showConfirmation(
      this.localize.t('modals.confirmClearAllTitle'),
      this.localize.t('prompts.confirmClearAll'),
      clearAction
    )
  }

  private _handleConfirmAction() {
    if (this._confirmAction) {
      this._confirmAction()
    }
    this._confirmModal?.hide()
    // Reset for next use
    this._confirmAction = null
  }

  private _handleSaveSetClick(e: Event) {
    e.preventDefault()
    if (this._repos.length > 0) {
      this._saveSetModal?.show()
    } else {
      alert(this.localize.t('errors.addRepoToSave'))
    }
  }

  private _handleSaveSetConfirm() {
    const input = this.querySelector('#saveSetNameInput') as HTMLInputElement
    const setName = input.value.trim()
    if (setName) {
      const repoIdentifiers = this._repos.map(
        (r) => `${r.username}/${r.repository}`
      )
      this._savedSets = { ...this._savedSets, [setName]: repoIdentifiers }
      this._saveSetsToStorage()
      trackEvent('save_set', {
        event_category: 'engagement',
        event_label: setName,
        repo_count: repoIdentifiers.length,
      })
      input.value = '' // Clear input
      this._saveSetModal?.hide()
    }
  }

  private async _handleLoadSet(e: Event, setName: string) {
    e.preventDefault()
    const repoIdentifiers = this._savedSets[setName]
    if (repoIdentifiers) {
      trackEvent('load_set', {
        event_category: 'engagement',
        event_label: setName,
      })
      this._repos = repoIdentifiers
        .map((r) => {
          const [username, repository] = r.split('/')
          return username && repository ? { username, repository } : null
        })
        .filter(
          (r): r is { username: string; repository: string } => r !== null
        )
      // Await the data fetch to ensure repoOrder is updated before the URL
      await this._fetchDataForRepos()
      this._updateURL()
    }
  }

  private _handleManageSetsClick(e: Event) {
    e.preventDefault()
    this._manageSetsModal?.show()
  }

  private _handleDeleteSet(setName: string) {
    const deleteAction = () => {
      // Create a new object without the deleted key
      const newSets = { ...this._savedSets }
      delete newSets[setName]
      this._savedSets = newSets
      this._saveSetsToStorage()
      trackEvent('delete_set', {
        event_category: 'engagement',
        event_label: setName,
      })
    }

    this._showConfirmation(
      this.localize.t('modals.confirmDeleteSetTitle'),
      this.localize.t('prompts.confirmDeleteSet', { setName }),
      deleteAction
    )
  }

  private _handleUpdateSet(setName: string) {
    const repoIdentifiers = this._repos.map(
      (r) => `${r.username}/${r.repository}`
    )
    this._savedSets = { ...this._savedSets, [setName]: repoIdentifiers }
    this._saveSetsToStorage()

    // Provide visual feedback
    this._justUpdatedSet = setName
    setTimeout(() => {
      this._justUpdatedSet = null
    }, 2000)
  }

  private _handleExportCsv() {
    if (this._repoSummaryData.length === 0) return
    trackEvent('export_csv', {
      event_category: 'engagement',
      event_label: 'Export CSV',
      repo_count: this._repos.length,
    })

    const headers = [
      'Repository',
      'Stars',
      'Latest Version',
      'Last Update',
      'Size (KB)',
      'Total Downloads',
    ]

    // Sort the data according to the current display order
    const sortedData = this._repoOrder
      .map((identifier) => {
        return this._repoSummaryData.find((d) => d.identifier === identifier)
      })
      .filter((d): d is RepoSummary => d !== undefined)

    const csvContent = generateCsvContent(sortedData, headers)
    downloadFile(
      csvContent,
      'github-release-stats.csv',
      'text/csv;charset=utf-8;'
    )
  }

  private _handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(
      () => {
        showToast(this.localize.t('comparison.copied'))
      },
      (err) => {
        console.error('Could not copy text to clipboard: ', err)
        alert(this.localize.t('errors.copyLinkFailed')) // Simple feedback for failure
      }
    )
  }

  private _handleCopyMarkdown() {
    if (this._repoSummaryData.length === 0) return
    trackEvent('copy_markdown', {
      event_category: 'engagement',
      event_label: 'Copy Markdown',
      repo_count: this._repos.length,
    })

    const headers = [
      'Repository',
      'Stars',
      'Open Issues',
      'Latest Version',
      'Total Downloads',
    ]

    const sortedData = this._repoOrder
      .map((identifier) =>
        this._repoSummaryData.find((d) => d.identifier === identifier)
      )
      .filter((d): d is RepoSummary => d !== undefined)

    const markdownContent = generateMarkdownContent(sortedData, headers)

    navigator.clipboard.writeText(markdownContent).then(
      () => {
        showToast(this.localize.t('comparison.markdownCopied'))
      },
      (err) => {
        console.error('Could not copy text to clipboard: ', err)
      }
    )
  }

  private _handlePinDashboard() {
    const button = this.querySelector('#pin-dashboard-button')
    if (!button) return

    const currentOrder = JSON.stringify(this._repoOrder)
    const isCurrentlyPinned =
      localStorage.getItem('default-dashboard') === currentOrder

    if (isCurrentlyPinned) {
      localStorage.removeItem('default-dashboard')
      this.requestUpdate()
    } else {
      localStorage.setItem('default-dashboard', currentOrder)
      button.innerHTML = `<i class="bi bi-pin-fill me-sm-2"></i><span class="d-none d-sm-inline">${this.localize.t(
        'comparison.pinned'
      )}</span>`
      setTimeout(() => {
        this.requestUpdate()
      }, 2000)
    }
  }

  private _updateAuthToken(token: string) {
    this._githubToken = token
    this.octokit = new Octokit({ auth: token || undefined })
    if (token) {
      localStorage.setItem('github-token', token)
    } else {
      localStorage.removeItem('github-token')
    }
    // After changing the token, refetch data if applicable.
    if (this._repos.length > 0) {
      this._fetchDataForRepos()
    }
  }

  private async _handlePwaInstall() {
    if (this._installPrompt) {
      await this._installPrompt.prompt()
      // The prompt can only be used once.
      this._installPrompt = null
    }
  }

  private _handleLanguageChange(e: Event, lang: string) {
    e.preventDefault()
    setLocale(lang)
    trackEvent('change_language', {
      event_category: 'ui_interaction',
      event_label: lang,
    })
  }

  private _showConfirmation(
    title: string,
    body: string,
    onConfirm: () => void
  ) {
    this._confirmModalTitle = title
    this._confirmModalBody = body
    this._confirmAction = onConfirm
    this._confirmModal?.show()
  }

  // Disable shadow DOM to allow global bootstrap styles to apply.
  protected createRenderRoot() {
    return this
  }

  render() {
    const confirmationTemplate =
      this._repoCountForConfirm > 0
        ? html`
            <div
              class="alert alert-info d-flex justify-content-between align-items-center mt-3"
              role="alert"
            >
              <span
                >${unsafeHTML(
                  this.localize.t('search.userHasRepos', {
                    user: this._userForConfirm,
                    count: this._repoCountForConfirm,
                  })
                )}</span
              >
              <button
                class="btn btn-sm btn-primary flex-shrink-0 ms-3"
                @click=${() => this._getUserRepos(this._userForConfirm)}
              >
                ${this.localize.t('search.loadSuggestions')}
              </button>
            </div>
          `
        : ''

    const modalsTemplate = html`
      <!-- Save Set Modal -->
      <div
        class="modal fade"
        id="saveSetModal"
        tabindex="-1"
        aria-labelledby="saveSetModalLabel"
        aria-hidden="true"
      >
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="saveSetModalLabel">
                ${this.localize.t('modals.saveSetTitle')}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div class="modal-body">
              <input
                type="text"
                class="form-control"
                id="saveSetNameInput"
                placeholder=${this.localize.t('modals.saveSetPlaceholder')}
              />
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                data-bs-dismiss="modal"
              >
                ${this.localize.t('modals.close')}
              </button>
              <button
                type="button"
                class="btn btn-primary"
                @click=${this._handleSaveSetConfirm}
              >
                ${this.localize.t('modals.saveSetButton')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Manage Sets Modal -->
      <div
        class="modal fade"
        id="manageSetsModal"
        tabindex="-1"
        aria-labelledby="manageSetsModalLabel"
        aria-hidden="true"
      >
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="manageSetsModalLabel">
                ${this.localize.t('modals.manageSetsTitle')}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div class="modal-body">
              ${Object.keys(this._savedSets).length > 0
                ? html`
                    <ul class="list-group">
                      ${Object.keys(this._savedSets).map(
                        (setName) => html`
                          <li
                            class="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <span class="me-2"
                              >${setName}
                              ${this._justUpdatedSet === setName
                                ? html`<span class="badge bg-success ms-2"
                                    >${this.localize.t('modals.updated')}</span
                                  >`
                                : ''}</span
                            >
                            <div class="btn-group btn-group-sm">
                              <button
                                class="btn btn-outline-primary"
                                @click=${() => this._handleUpdateSet(setName)}
                                title=${this.localize.t('modals.updateSet')}
                                ?disabled=${this._repos.length === 0}
                              >
                                <i class="bi bi-arrow-clockwise"></i>
                              </button>
                              <button
                                class="btn btn-outline-danger"
                                @click=${() => this._handleDeleteSet(setName)}
                                title=${this.localize.t('modals.deleteSet')}
                              >
                                <i class="bi bi-trash"></i>
                              </button>
                            </div>
                          </li>
                        `
                      )}
                    </ul>
                  `
                : html`<p class="text-muted">
                    ${this.localize.t('modals.noSavedSets')}
                  </p>`}
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                data-bs-dismiss="modal"
              >
                ${this.localize.t('modals.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `

    const confirmationModalTemplate = html`
      <!-- Generic Confirmation Modal -->
      <div
        class="modal fade"
        id="confirmModal"
        tabindex="-1"
        aria-labelledby="confirmModalLabel"
        aria-hidden="true"
      >
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmModalLabel">
                ${this._confirmModalTitle}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div class="modal-body">${this._confirmModalBody}</div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                data-bs-dismiss="modal"
              >
                ${this.localize.t('modals.cancelButton')}
              </button>
              <button
                type="button"
                class="btn btn-danger"
                @click=${this._handleConfirmAction}
              >
                ${this.localize.t('modals.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `

    return html`
      <style>
        body {
          /* Apply the imported Roboto font to the entire application */
          font-family: 'Roboto', sans-serif;
        }
      </style>

      <app-header></app-header>

      <main class="flex-shrink-0">
        <div class="container py-4">
          ${this._repos.length === 0
            ? html`
                <!-- Initial Search View -->
                <div class="row justify-content-center">
                  <div class="col-lg-8">
                    <div class="card shadow-sm">
                      <div class="card-body p-4 p-md-5">
                        <h1 class="h2 text-center mb-4">
                          ${this.localize.t('comparison.title')}
                        </h1>
                        <p class="text-center text-muted mb-4">
                          ${this.localize.t('comparison.description')}
                        </p>
                        <search-form
                          .username=${this._newUsername}
                          .repository=${this._newRepository}
                          .suggestions=${this._filteredSuggestions}
                          .suggestionsLoading=${this._suggestionsLoading}
                          buttonText=${this.localize.t('search.getStats')}
                          @username-input=${this._handleUsernameInput}
                          @repository-input=${this._handleRepoInput}
                          @username-change=${this._handleUsernameChange}
                          @form-submit=${this._handleFormSubmit}
                        ></search-form>
                        ${confirmationTemplate}
                      </div>
                      ${Object.keys(this._savedSets).length > 0
                        ? html` <div class="card-footer text-center">
                            <div class="dropdown">
                              <button
                                class="btn btn-link text-secondary dropdown-toggle"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                              >
                                ${this.localize.t('comparison.loadSet')}
                              </button>
                              <ul class="dropdown-menu">
                                ${Object.keys(this._savedSets).map(
                                  (setName) => html`
                                    <li>
                                      <a
                                        class="dropdown-item"
                                        href="#"
                                        @click=${(e: Event) =>
                                          this._handleLoadSet(e, setName)}
                                        >${setName}</a
                                      >
                                    </li>
                                  `
                                )}
                              </ul>
                            </div>
                          </div>`
                        : ''}
                    </div>
                  </div>
                </div>
              `
            : html`
                <!-- Comparison View -->
                <div
                  class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4"
                >
                  <div class="d-flex align-items-center flex-wrap gap-2">
                    <strong class="me-2"
                      >${this.localize.t('comparison.comparing')}</strong
                    >
                    <div
                      id="repo-pills-container"
                      class="d-flex flex-wrap gap-2"
                    >
                      ${repeat(
                        this._repoOrder,
                        (identifier) => identifier,
                        (identifier) => {
                          const repo = this._repos.find(
                            (r) =>
                              `${r.username}/${r.repository}` === identifier
                          )
                          if (!repo) return ''
                          return html`
                            <span
                              class="badge d-flex align-items-center p-2 text-bg-secondary mw-100"
                              data-identifier=${identifier}
                              style="cursor: move;"
                            >
                              <i class="bi bi-github me-2 flex-shrink-0"></i>
                              <span class="text-truncate" title=${identifier}
                                >${identifier}</span
                              >
                              <button
                                type="button"
                                class="btn-close btn-close-white ms-2 flex-shrink-0"
                                aria-label="Remove ${identifier}"
                                @click=${() => this._handleRemoveRepo(repo)}
                              ></button>
                            </span>
                          `
                        }
                      )}
                    </div>
                  </div>
                  <div
                    class="btn-group btn-group-sm flex-shrink-0"
                    role="group"
                  >
                    <div class="btn-group" role="group">
                      <button
                        type="button"
                        class="btn btn-outline-secondary dropdown-toggle"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        <i class="bi bi-bookmark-star me-lg-2"></i
                        ><span class="d-none d-lg-inline"
                          >${this.localize.t('comparison.sets')}</span
                        >
                      </button>
                      <ul class="dropdown-menu">
                        <li>
                          <a
                            class="dropdown-item"
                            href="#"
                            @click=${this._handleSaveSetClick}
                            >${this.localize.t('comparison.saveSet')}</a
                          >
                        </li>
                        ${Object.keys(this._savedSets).length > 0
                          ? html`<li><hr class="dropdown-divider" /></li>`
                          : ''}
                        ${Object.keys(this._savedSets).map(
                          (setName) => html`
                            <li>
                              <a
                                class="dropdown-item"
                                href="#"
                                @click=${(e: Event) =>
                                  this._handleLoadSet(e, setName)}
                                >${setName}</a
                              >
                            </li>
                          `
                        )}
                        ${Object.keys(this._savedSets).length > 0
                          ? html`
                              <li><hr class="dropdown-divider" /></li>
                              <li>
                                <a
                                  class="dropdown-item"
                                  href="#"
                                  @click=${this._handleManageSetsClick}
                                  >${this.localize.t(
                                    'comparison.manageSets'
                                  )}</a
                                >
                              </li>
                            `
                          : ''}
                      </ul>
                    </div>
                    <button
                      id="copy-link-button"
                      class="btn btn-outline-secondary"
                      aria-label=${this.localize.t('comparison.copyLink')}
                      title=${this.localize.t('comparison.copyLink')}
                      @click=${this._handleCopyLink}
                    >
                      <i class="bi bi-clipboard me-lg-2" aria-hidden="true"></i
                      ><span class="d-none d-lg-inline" aria-hidden="true"
                        >${this.localize.t('comparison.copyLink')}</span
                      >
                    </button>
                    <button
                      class="btn btn-outline-secondary"
                      aria-label=${this.localize.t('comparison.exportCsv')}
                      title=${this.localize.t('comparison.exportCsv')}
                      @click=${this._handleExportCsv}
                    >
                      <i class="bi bi-download me-lg-2" aria-hidden="true"></i
                      ><span class="d-none d-lg-inline" aria-hidden="true"
                        >${this.localize.t('comparison.exportCsv')}</span
                      >
                    </button>
                    <button
                      id="copy-markdown-button"
                      class="btn btn-outline-secondary"
                      aria-label=${this.localize.t('comparison.copyMarkdown')}
                      title=${this.localize.t('comparison.copyMarkdown')}
                      @click=${this._handleCopyMarkdown}
                    >
                      <i class="bi bi-markdown me-lg-2" aria-hidden="true"></i
                      ><span class="d-none d-lg-inline" aria-hidden="true"
                        >${this.localize.t('comparison.copyMarkdown')}</span
                      >
                    </button>
                    <button
                      id="pin-dashboard-button"
                      class="btn btn-outline-secondary"
                      aria-label=${this.localize.t(
                        localStorage.getItem('default-dashboard') ===
                          JSON.stringify(this._repoOrder)
                          ? 'comparison.unpinDashboard'
                          : 'comparison.pinDashboard'
                      )}
                      title=${this.localize.t(
                        localStorage.getItem('default-dashboard') ===
                          JSON.stringify(this._repoOrder)
                          ? 'comparison.unpinDashboard'
                          : 'comparison.pinDashboard'
                      )}
                      @click=${this._handlePinDashboard}
                    >
                      <i
                        class="bi ${localStorage.getItem(
                          'default-dashboard'
                        ) === JSON.stringify(this._repoOrder)
                          ? 'bi-pin-fill'
                          : 'bi-pin-angle'} me-lg-2"
                        aria-hidden="true"
                      ></i
                      ><span class="d-none d-lg-inline" aria-hidden="true"
                        >${this.localize.t(
                          localStorage.getItem('default-dashboard') ===
                            JSON.stringify(this._repoOrder)
                            ? 'comparison.unpinDashboard'
                            : 'comparison.pinDashboard'
                        )}</span
                      >
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      aria-label=${this.localize.t('comparison.clearAll')}
                      title=${this.localize.t('comparison.clearAll')}
                      @click=${this._handleClearAllRepos}
                    >
                      <i class="bi bi-trash me-lg-2" aria-hidden="true"></i
                      ><span class="d-none d-lg-inline" aria-hidden="true"
                        >${this.localize.t('comparison.clearAll')}</span
                      >
                    </button>
                  </div>
                </div>

                <div class="card shadow-sm mb-4">
                  <div class="card-body">
                    <search-form
                      .username=${this._newUsername}
                      .repository=${this._newRepository}
                      .suggestions=${this._filteredSuggestions}
                      .suggestionsLoading=${this._suggestionsLoading}
                      buttonText=${this.localize.t('search.addRepository')}
                      @username-input=${this._handleUsernameInput}
                      @repository-input=${this._handleRepoInput}
                      @username-change=${this._handleUsernameChange}
                      @form-submit=${this._handleFormSubmit}
                    ></search-form>
                    ${confirmationTemplate}
                  </div>
                </div>

                ${this._error
                  ? html`<div class="alert alert-warning">${this._error}</div>`
                  : ''}
                ${this._authError
                  ? html`<div class="alert alert-info" role="alert">
                      <i class="bi bi-info-circle-fill me-2"></i>${this
                        ._authError}
                    </div>`
                  : ''}

                <summary-table
                  .summaryData=${this._repoSummaryData}
                  .repoOrder=${this._repoOrder}
                  .sortKey=${this._sortKey}
                  .sortDirection=${this._sortDirection}
                  .showTotalDownloads=${this._showTotalDownloads}
                  @request-sort=${this._handleRequestSort}
                  @copy-repo-report=${this._handleCopyReport}
                ></summary-table>

                <div
                  class="d-flex justify-content-end align-items-center mb-2 flex-wrap gap-2"
                >
                  <div
                    class="d-flex justify-content-end"
                    role="group"
                    aria-label="Y-axis scale toggle"
                  >
                    <div class="btn-group btn-group-sm">
                      <input
                        type="radio"
                        class="btn-check"
                        name="scale-toggle"
                        id="scale-log"
                        autocomplete="off"
                        .checked=${this._yAxisScale === 'logarithmic'}
                        @change=${() => this._handleScaleChange('logarithmic')}
                      />
                      <label class="btn btn-outline-secondary" for="scale-log"
                        ><i class="bi bi-graph-up me-2"></i>${this.localize.t(
                          'charts.logarithmic'
                        )}</label
                      >

                      <input
                        type="radio"
                        class="btn-check"
                        name="scale-toggle"
                        id="scale-linear"
                        autocomplete="off"
                        .checked=${this._yAxisScale === 'linear'}
                        @change=${() => this._handleScaleChange('linear')}
                      />
                      <label
                        class="btn btn-outline-secondary"
                        for="scale-linear"
                        ><i class="bi bi-bar-chart-steps me-2"></i
                        >${this.localize.t('charts.linear')}</label
                      >
                    </div>
                    <button
                      class="btn btn-sm btn-outline-secondary ms-2"
                      @click=${this._handleResetZoom}
                      title=${this.localize.t('charts.resetZoom')}
                    >
                      <i class="bi bi-arrow-counterclockwise me-sm-2"></i
                      ><span class="d-none d-sm-inline"
                        >${this.localize.t('charts.resetZoom')}</span
                      >
                    </button>
                  </div>
                </div>

                <chart-display
                  .releasesData=${this._releasesData}
                  .stargazersData=${this._stargazersData}
                  .issuesData=${this._issuesData}
                  .pullRequestsData=${this._pullRequestsData}
                  .repoOrder=${this._repoOrder}
                  .metric=${this._chartMetric}
                  .yAxisScale=${this._yAxisScale}
                  .filterDependabot=${this._filterDependabot}
                  .limitZoomOut=${true}
                ></chart-display>

                <div class="accordion" id="resultsAccordion">
                  ${this._repoOrder.map((repoIdentifier) => {
                    const releases =
                      this._releasesData.get(repoIdentifier) || []
                    const totalDownloads =
                      this._downloadsData.get(repoIdentifier) || 0

                    return html`
                      <div class="accordion-item">
                        <h2
                          class="accordion-header"
                          id="heading-${repoIdentifier.replace('/', '-')}"
                        >
                          <button
                            class="accordion-button collapsed"
                            type="button"
                            data-bs-toggle="collapse"
                            data-bs-target="#collapse-${repoIdentifier.replace(
                              '/',
                              '-'
                            )}"
                            aria-expanded="false"
                          >
                            <div
                              class="d-flex justify-content-between align-items-center flex-grow-1 overflow-hidden me-2"
                            >
                              <strong
                                class="text-truncate me-3"
                                title=${repoIdentifier}
                                ><i class="bi bi-github me-2 flex-shrink-0"></i>
                                ${repoIdentifier}</strong
                              >
                              ${this._showTotalDownloads
                                ? html`
                                    <span
                                      class="d-none d-md-block text-muted text-nowrap flex-shrink-0"
                                      >${this.localize.t(
                                        'releaseDetails.totalDownloads'
                                      )}
                                      <span
                                        class="badge bg-primary rounded-pill ms-2"
                                        >${new Intl.NumberFormat(
                                          getLocale()
                                        ).format(totalDownloads)}</span
                                      ></span
                                    >
                                  `
                                : ''}
                            </div>
                          </button>
                        </h2>
                        <div
                          id="collapse-${repoIdentifier.replace('/', '-')}"
                          class="accordion-collapse collapse"
                          data-bs-parent="#resultsAccordion"
                        >
                          <div class="accordion-body p-2">
                            <results-display
                              .releases=${releases}
                              .showTotalDownloads=${this._showTotalDownloads}
                            ></results-display>
                          </div>
                        </div>
                      </div>
                    `
                  })}
                </div>
              `}
          ${modalsTemplate} ${confirmationModalTemplate}
          <settings-modal
            .filterDependabot=${this._filterDependabot}
            .showTotalDownloads=${this._showTotalDownloads}
            .githubToken=${this._githubToken}
            .theme=${this._themeSetting}
            @filter-dependabot-change=${(e: CustomEvent<boolean>) => {
              this._filterDependabot = e.detail
              localStorage.setItem('filterDependabot', String(e.detail))
              this._fetchDataForRepos()
            }}
            @show-total-downloads-change=${(e: CustomEvent<boolean>) => {
              this._showTotalDownloads = e.detail
              localStorage.setItem('showTotalDownloads', String(e.detail))
              if (
                !this._showTotalDownloads &&
                this._sortKey === 'totalDownloads'
              ) {
                this._sortKey = 'size'
                this._chartMetric = 'size'
              } else if (this._showTotalDownloads) {
                this._sortKey = 'totalDownloads'
                this._chartMetric = 'totalDownloads'
              }
            }}
            @language-change=${(e: CustomEvent<string>) =>
              this._handleLanguageChange(e, e.detail)}
            @theme-change=${(e: CustomEvent<string>) => {
              const newTheme = e.detail as 'light' | 'dark' | 'auto'
              if (
                newTheme === 'light' ||
                newTheme === 'dark' ||
                newTheme === 'auto'
              ) {
                this._themeSetting = newTheme
                localStorage.setItem('theme', newTheme)
                this._applyTheme()
              }
            }}
            @save-token=${(e: CustomEvent<string>) => {
              this._updateAuthToken(e.detail)
            }}
            @clear-token=${() => this._updateAuthToken('')}
          ></settings-modal>
        </div>
      </main>

      <app-footer class="mt-auto d-block w-100">
        <rate-limit-display .octokit=${this.octokit}></rate-limit-display>
      </app-footer>

      <div
        class="position-fixed top-0 p-2 d-flex gap-2"
        style="z-index: 1030; left: calc(env(titlebar-area-x, 0px) + env(titlebar-area-width, 100%)); transform: translateX(-100%);"
      >
        <button
          class="btn btn-outline-secondary rounded-circle"
          data-bs-toggle="modal"
          data-bs-target="#settingsModal"
          aria-label=${this.localize.t('settings.title') || 'Settings'}
          title=${this.localize.t('settings.title') || 'Settings'}
        >
          <i class="bi bi-gear-fill"></i>
        </button>
      </div>

      ${this._installPrompt
        ? html`
            <div class="position-fixed bottom-0 end-0 p-3" style="z-index: 11">
              <pwa-install-toast
                .installPrompt=${this._installPrompt}
                @install-pwa=${this._handlePwaInstall}
                @dismiss-pwa=${this._handlePwaDismiss}
              ></pwa-install-toast>
            </div>
          `
        : ''}
      ${this._loading ? html`<loading-spinner></loading-spinner>` : ''}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'github-release-stats': GithubReleaseStats
  }
}
