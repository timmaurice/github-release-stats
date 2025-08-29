import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import type { GitHubRelease } from './types'
import { Octokit } from '@octokit/rest'
import type { RepoSummary, SortKey } from './components/summary-table'
import { Modal, Dropdown, Collapse } from 'bootstrap'
import Sortable from 'sortablejs'
import { LocalizeController } from './localization/localize-controller'
import { getLocale, setLocale } from './localization/registry'

// Import sub-components
import type { ChartDisplay } from './components/chart-display'
import './components/app-footer'
import './components/app-header'
import './components/chart-display'
import './components/loading-spinner'
import './components/results-display'
import './components/rate-limit-display'
import './components/summary-table'
import './components/search-form'

// Import global styles
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '@fontsource/roboto'

@customElement('github-release-stats')
export class GithubReleaseStats extends LitElement {
  private localize = new LocalizeController(this)

  // Instantiate Octokit for GitHub API requests
  private octokit = new Octokit()

  // Modals
  private _saveSetModal: Modal | null = null
  private _manageSetsModal: Modal | null = null
  private _confirmModal: Modal | null = null
  private _sortableInstance: Sortable | null = null

  private _storageKey = 'github-release-stats-sets'

  // Form state for the next repo to be added
  @state() private _newUsername = ''
  @state() private _newRepository = ''

  // Main state for the application
  @state() private _repos: { username: string; repository: string }[] = []
  @state() private _releasesData: Map<string, GitHubRelease[]> = new Map()
  @state() private _downloadsData: Map<string, number> = new Map()
  @state() private _stargazersData: Map<string, { starred_at: string }[]> =
    new Map()
  @state() private _issuesData: Map<
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
  @state() private _theme: 'light' | 'dark' = 'light'
  @state() private _repoCountForConfirm = 0
  @state() private _userForConfirm = ''
  @state() private _githubToken = ''
  @state() private _yAxisScale: 'linear' | 'logarithmic' = 'linear'
  @state() private _suggestionsLoading = false
  @state() private _savedSets: Record<string, string[]> = {}
  @state() private _justUpdatedSet: string | null = null

  // State for the generic confirmation modal
  @state() private _confirmModalTitle = ''
  @state() private _confirmModalBody = ''
  @state() private _confirmAction: (() => void) | null = null

  constructor() {
    super()
    this._initializeTheme()
    const token = localStorage.getItem('github-token') || ''
    this._githubToken = token
    this.octokit = new Octokit({ auth: token || undefined })
    this._loadSetsFromStorage()
  }

  connectedCallback(): void {
    super.connectedCallback()
    this._readStateFromURL()
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', this._handleSystemThemeChange)
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .removeEventListener('change', this._handleSystemThemeChange)
  }

  updated() {
    // Initialize Bootstrap modals
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

    // Manually initialize Bootstrap components that rely on data attributes,
    // as they may not initialize automatically when rendered inside a Lit component.
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
        onEnd: (evt) => {
          const newOrder = Array.from(evt.target.children).map(
            (item) => (item as HTMLElement).dataset.identifier!
          )
          this._setNewOrder(newOrder)
        },
      })
    } else if (!pillsContainer && this._sortableInstance) {
      // Cleanup if the container is removed
      this._sortableInstance.destroy()
      this._sortableInstance = null
    }
  }

  private _initializeTheme() {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      this._theme = savedTheme
    } else {
      this._theme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    this._applyTheme()
  }

  private _handleSystemThemeChange = (e: MediaQueryListEvent) => {
    // Only change if no theme is explicitly set in localStorage
    if (!localStorage.getItem('theme')) {
      this._theme = e.matches ? 'dark' : 'light'
      this._applyTheme()
    }
  }

  private _readStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search)
    const reposFromUrl = urlParams.get('repos')?.split(',') || []

    this._repos = reposFromUrl
      .map((r) => {
        const [username, repository] = r.split('/')
        return username && repository ? { username, repository } : null
      })
      .filter((r): r is { username: string; repository: string } => r !== null)

    if (this._repos.length > 0) {
      this._fetchDataForRepos()
    }
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
      // Use octokit's pagination helper to fetch all repositories
      const repos = await this.octokit.paginate(
        this.octokit.rest.repos.listForUser,
        {
          username,
          per_page: 100,
        }
      )
      this._repoSuggestions = repos.map((repo) => repo.name)
    } catch (error) {
      console.error('Failed to fetch user repos:', error)
      this._repoSuggestions = []
    } finally {
      this._suggestionsLoading = false
    }
  }

  private async _fetchStargazers(
    owner: string,
    repo: string
  ): Promise<{ starred_at: string }[]> {
    const stargazers: { starred_at: string }[] = []
    const iterator = this.octokit.paginate.iterator(
      this.octokit.rest.activity.listStargazersForRepo,
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

  private async _fetchIssues(
    owner: string,
    repo: string
  ): Promise<{ created_at: string; closed_at: string | null }[]> {
    const issues: { created_at: string; closed_at: string | null }[] = []
    const iterator = this.octokit.paginate.iterator(
      this.octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        per_page: 100,
        state: 'all', // we need both open and closed to track over time
      }
    )

    let pageCount = 0
    // Fetch up to 1000 issues to avoid hitting rate limits on very popular repos.
    const MAX_ISSUE_PAGES = 10

    for await (const { data: pageData } of iterator) {
      // The response contains pull requests as well, we should filter them out.
      const issuesOnly = pageData.filter((issue) => !issue.pull_request)
      issues.push(
        ...issuesOnly.map((i) => ({
          created_at: i.created_at,
          closed_at: i.closed_at,
        }))
      )
      pageCount++
      if (pageCount >= MAX_ISSUE_PAGES) {
        break
      }
    }
    return issues
  }

  private async _fetchDataForRepos() {
    this._loading = true
    this._error = ''

    const fetchPromises = this._repos.map(({ username, repository }) => {
      const releasesPromise = this.octokit.rest.repos.listReleases({
        owner: username,
        repo: repository,
        per_page: 30,
      })
      const repoDetailsPromise = this.octokit.rest.repos.get({
        owner: username,
        repo: repository,
      })
      return Promise.all([releasesPromise, repoDetailsPromise])
    })

    try {
      const results = await Promise.all(fetchPromises)
      const newReleasesData = new Map<string, GitHubRelease[]>()
      const newDownloadsData = new Map<string, number>()
      const newSummaryData: RepoSummary[] = []

      results.forEach(([releasesResponse, repoDetailsResponse], index) => {
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
            openIssues: repoDetails.open_issues_count,
          })
        }
      })

      this._releasesData = newReleasesData
      this._downloadsData = newDownloadsData
      this._repoSummaryData = newSummaryData
      // Initialize the display order
      this._repoOrder = this._repos.map((r) => `${r.username}/${r.repository}`)
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
    if (this._repoSuggestions.includes(this._newRepository)) {
      this._handleFormSubmit()
    }
  }

  private async _handleUsernameChange() {
    if (!this._newUsername) return

    // Reset previous state
    this._repoCountForConfirm = 0
    this._userForConfirm = ''
    this._repoSuggestions = []
    this._error = '' // Clear previous errors

    try {
      const { data: userData } = await this.octokit.rest.users.getByUsername({
        username: this._newUsername,
      })
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

  private _handleFormSubmit() {
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
      this._fetchDataForRepos()
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

  private async _handleRequestSort(e: CustomEvent<SortKey>) {
    const newSortKey = e.detail
    this._authError = '' // Clear previous auth errors on any sort attempt

    if (
      (newSortKey === 'stars' || newSortKey === 'openIssues') &&
      !this._githubToken
    ) {
      this._authError = this.localize.t('errors.authRequired')
      return
    }

    if (newSortKey === 'manual') {
      return
    }
    let newSortDirection: 'asc' | 'desc'

    if (this._sortKey === newSortKey) {
      newSortDirection = this._sortDirection === 'asc' ? 'desc' : 'asc'
    } else {
      // Default to descending for numeric values, ascending for text
      newSortDirection =
        newSortKey === 'latestVersion' || newSortKey === 'lastUpdate'
          ? 'asc'
          : 'desc'
    }

    this._sortKey = newSortKey
    this._sortDirection = newSortDirection
    this._chartMetric = newSortKey

    const sorted = [...this._repoSummaryData].sort((a, b) => {
      const valA = a[newSortKey]
      const valB = b[newSortKey]
      let comparison = 0
      if (valA > valB) comparison = 1
      else if (valA < valB) comparison = -1
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
            this._fetchStargazers(repo.username, repo.repository)
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
            this._fetchIssues(repo.username, repo.repository)
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
  }

  private _handleScaleChange(scale: 'linear' | 'logarithmic') {
    this._yAxisScale = scale
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
      input.value = '' // Clear input
      this._saveSetModal?.hide()
    }
  }

  private _handleLoadSet(e: Event, setName: string) {
    e.preventDefault()
    const repoIdentifiers = this._savedSets[setName]
    if (repoIdentifiers) {
      this._repos = repoIdentifiers
        .map((r) => {
          const [username, repository] = r.split('/')
          return username && repository ? { username, repository } : null
        })
        .filter(
          (r): r is { username: string; repository: string } => r !== null
        )
      this._fetchDataForRepos()
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

    const rows = sortedData.map((repo) => {
      // Sanitize data for CSV: escape commas and quotes
      const escapeCsv = (str: string | number) => {
        const s = String(str)
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`
        }
        return s
      }
      return [
        escapeCsv(repo.identifier),
        repo.stars,
        escapeCsv(repo.latestVersion),
        repo.lastUpdate,
        repo.size,
        repo.totalDownloads,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'github-release-stats.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  private _handleCopyLink() {
    const button = this.querySelector('#copy-link-button')
    if (!button) return
    const originalContent = button.innerHTML

    navigator.clipboard.writeText(window.location.href).then(
      () => {
        button.innerHTML = `<i class="bi bi-check-lg me-sm-2"></i><span class="d-none d-sm-inline">${this.localize.t(
          'comparison.copied'
        )}</span>`
        setTimeout(() => {
          button.innerHTML = originalContent
        }, 2000)
      },
      (err) => {
        console.error('Could not copy text to clipboard: ', err)
        alert(this.localize.t('errors.copyLinkFailed')) // Simple feedback for failure
      }
    )
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

  private _handleSaveTokenFormSubmit(e: Event) {
    e.preventDefault()
    this._handleSaveToken()
  }

  private _handleSaveToken() {
    const input = this.querySelector('#token-input') as HTMLInputElement
    if (input) {
      this._updateAuthToken(input.value.trim())
    }
  }

  private _handleClearToken() {
    const input = this.querySelector('#token-input') as HTMLInputElement
    if (input) input.value = '' // Clear input immediately for better UX
    this._updateAuthToken('')
  }

  private _toggleTheme() {
    this._theme = this._theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', this._theme)
    this._applyTheme()
  }

  private _handleLanguageChange(e: Event, lang: string) {
    e.preventDefault()
    setLocale(lang)
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

  private _applyTheme() {
    document.documentElement.setAttribute('data-bs-theme', this._theme)
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

    const authSettingsTemplate = html`
      <div class="accordion mt-5" id="settingsAccordion">
        <div class="accordion-item">
          <h2 class="accordion-header" id="authHeading">
            <button
              class="accordion-button collapsed"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#authCollapse"
              aria-expanded="false"
              aria-controls="authCollapse"
            >
              <i class="bi bi-key-fill me-2"></i> ${this.localize.t(
                'settings.apiAuth'
              )}
            </button>
          </h2>
          <div
            id="authCollapse"
            class="accordion-collapse collapse"
            aria-labelledby="authHeading"
          >
            <div class="accordion-body">
              <p class="text-muted small">
                ${unsafeHTML(this.localize.t('settings.apiAuthDescription'))}
              </p>
              <div class="mb-3">
                <strong>${this.localize.t('settings.status')}</strong>
                ${this._githubToken
                  ? html`<span class="badge bg-success ms-2"
                      ><i class="bi bi-check-circle-fill me-1"></i>
                      ${this.localize.t('settings.authenticated')}</span
                    >`
                  : html`<span class="badge bg-secondary ms-2"
                      ><i class="bi bi-x-circle-fill me-1"></i>
                      ${this.localize.t('settings.anonymous')}</span
                    >`}
              </div>
              <form @submit=${this._handleSaveTokenFormSubmit}>
                <div class="input-group">
                  <input
                    id="token-input"
                    type="password"
                    class="form-control"
                    placeholder="ghp_..."
                    autocomplete="new-password"
                    .value=${this._githubToken}
                  />
                  <button type="submit" class="btn btn-primary">
                    ${this.localize.t('settings.save')}
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    @click=${this._handleClearToken}
                  >
                    ${this.localize.t('settings.clear')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `

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
                          .suggestions=${this._repoSuggestions}
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
                      ${this._repoOrder.map((identifier) => {
                        const repo = this._repos.find(
                          (r) => `${r.username}/${r.repository}` === identifier
                        )
                        if (!repo) return ''
                        return html`
                          <span
                            class="badge d-flex align-items-center p-2 text-bg-secondary"
                            data-identifier=${identifier}
                            style="cursor: move;"
                          >
                            <i class="bi bi-github me-2"></i>
                            ${identifier}
                            <button
                              type="button"
                              class="btn-close btn-close-white ms-2"
                              aria-label="Remove ${identifier}"
                              @click=${() => this._handleRemoveRepo(repo)}
                            ></button>
                          </span>
                        `
                      })}
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
                        <i class="bi bi-bookmark-star me-sm-2"></i
                        ><span class="d-none d-sm-inline"
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
                      @click=${this._handleCopyLink}
                    >
                      <i class="bi bi-clipboard me-sm-2"></i
                      ><span class="d-none d-sm-inline"
                        >${this.localize.t('comparison.copyLink')}</span
                      >
                    </button>
                    <button
                      class="btn btn-outline-secondary"
                      @click=${this._handleExportCsv}
                    >
                      <i class="bi bi-download me-sm-2"></i
                      ><span class="d-none d-sm-inline"
                        >${this.localize.t('comparison.exportCsv')}</span
                      >
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      @click=${this._handleClearAllRepos}
                    >
                      <i class="bi bi-trash me-sm-2"></i
                      ><span class="d-none d-sm-inline"
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
                      .suggestions=${this._repoSuggestions}
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
                  @request-sort=${this._handleRequestSort}
                ></summary-table>

                <div
                  class="d-flex justify-content-end mb-2"
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
                    <label class="btn btn-outline-secondary" for="scale-linear"
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

                <chart-display
                  .releasesData=${this._releasesData}
                  .stargazersData=${this._stargazersData}
                  .issuesData=${this._issuesData}
                  .repoOrder=${this._repoOrder}
                  .metric=${this._chartMetric}
                  .yAxisScale=${this._yAxisScale}
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
                              class="d-flex justify-content-between align-items-center w-100 me-3"
                            >
                              <strong class="text-truncate me-3"
                                ><i class="bi bi-github me-2"></i>
                                ${repoIdentifier}</strong
                              >
                              <span
                                class="d-none d-md-block text-muted text-nowrap flex-shrink-0"
                                >${this.localize.t(
                                  'releaseDetails.totalDownloads'
                                )}
                                <span class="badge bg-primary rounded-pill ms-2"
                                  >${new Intl.NumberFormat().format(
                                    totalDownloads
                                  )}</span
                                ></span
                              >
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
                            ></results-display>
                          </div>
                        </div>
                      </div>
                    `
                  })}
                </div>
              `}
          ${authSettingsTemplate} ${modalsTemplate} ${confirmationModalTemplate}
        </div>
      </main>

      <app-footer>
        <rate-limit-display .octokit=${this.octokit}></rate-limit-display>
      </app-footer>

      <div
        class="position-fixed top-0 end-0 p-2 d-flex gap-2"
        style="z-index: 1030;"
      >
        <div class="dropdown">
          <button
            class="btn btn-outline-secondary rounded-circle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            title="${this.localize.t('app.language')}"
          >
            <i class="bi bi-translate"></i>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li>
              <a
                class="dropdown-item ${getLocale() === 'en' ? 'active' : ''}"
                href="#"
                @click=${(e: Event) => this._handleLanguageChange(e, 'en')}
                >English</a
              >
            </li>
            <li>
              <a
                class="dropdown-item ${getLocale() === 'de' ? 'active' : ''}"
                href="#"
                @click=${(e: Event) => this._handleLanguageChange(e, 'de')}
                >Deutsch</a
              >
            </li>
            <li>
              <a
                class="dropdown-item ${getLocale() === 'zh-CN' ? 'active' : ''}"
                href="#"
                @click=${(e: Event) => this._handleLanguageChange(e, 'zh-CN')}
                >简体中文</a
              >
            </li>
          </ul>
        </div>
        <button
          @click=${this._toggleTheme}
          class="btn btn-outline-secondary rounded-circle"
          aria-label=${this.localize.t('settings.toggleTheme')}
          title=${this.localize.t('settings.toggleTheme')}
        >
          <i
            class="bi ${this._theme === 'light'
              ? 'bi-moon-stars-fill'
              : 'bi-sun-fill'}"
          ></i>
        </button>
      </div>

      ${this._loading ? html`<loading-spinner></loading-spinner>` : ''}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'github-release-stats': GithubReleaseStats
  }
}
