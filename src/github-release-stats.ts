import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { repeat } from 'lit/directives/repeat.js'
import { trackEvent } from './analytics'
import type { BeforeInstallPromptEvent } from './types'
import type { RepoSummary, SortKey } from './components/summary-table'
import { Modal, Dropdown, Collapse } from 'bootstrap'
import Sortable from 'sortablejs'
import { LocalizeController } from './localization/localize-controller'
import { getLocale, setLocale } from './localization/registry'
import { SettingsController } from './controllers/settings-controller'
import { SavedSetsController } from './controllers/saved-sets-controller'
import {
  RepoDataController,
  parseIdentifier,
  repoIdentifier,
  type RepoRef,
} from './controllers/repo-data-controller'
import {
  generateCsvContent,
  generateMarkdownContent,
  generateSingleRepoMarkdownReport,
  downloadFile,
} from './utils/export-helpers'
import { getUserByUsername, listUserRepos } from './utils/github-api'
import { clearCache } from './utils/cache'
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

  readonly settings = new SettingsController(this, () => {
    if (this.data.repos.length > 0) {
      this.data.fetchAll()
    }
  })

  readonly sets = new SavedSetsController(this)

  readonly data = new RepoDataController(this, {
    getOctokit: () => this.settings.octokit,
    getFilterDependabot: () => this.settings.filterDependabot,
    getHidePreReleases: () => this.settings.hidePreReleases,
    t: (key, replacements) => this.localize.t(key, replacements),
    onOrderChange: () => this._updateURL(),
  })

  private _saveSetModal?: Modal
  private _manageSetsModal?: Modal
  private _confirmModal?: Modal
  private _settingsModal?: Modal | null = null
  private _sortableInstance: Sortable | null = null
  private _chartModuleRequested = false

  @state() private _newUsername = ''
  @state() private _newRepository = ''

  @state() private _chartMetric: SortKey = 'totalDownloads'
  @state() private _authError = ''
  @state() private _repoSuggestions: string[] = []
  @state() private _repoCountForConfirm = 0
  @state() private _userForConfirm = ''
  @state() private _yAxisScale: 'linear' | 'logarithmic' = 'linear'
  @state() private _suggestionsLoading = false

  @state() private _installPrompt: BeforeInstallPromptEvent | null = null
  @state() private _confirmModalTitle = ''
  @state() private _confirmModalBody = ''
  @state() private _confirmAction: (() => void) | null = null

  private get _filteredSuggestions() {
    const currentUsername = this._newUsername.toLowerCase()
    const addedReposForUser = new Set(
      this.data.repos
        .filter((r) => r.username.toLowerCase() === currentUsername)
        .map((r) => r.repository.toLowerCase())
    )
    return this._repoSuggestions.filter(
      (suggestion) => !addedReposForUser.has(suggestion.toLowerCase())
    )
  }

  constructor() {
    super()
    // If downloads are hidden, don't use it as the default chart/sort metric
    if (!this.settings.showTotalDownloads) {
      this.data.sortKey = 'size'
      this._chartMetric = 'size'
    }
  }

  connectedCallback(): void {
    super.connectedCallback()
    this._readStateFromURL()

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
  }

  updated() {
    if (!this._chartModuleRequested && this.data.repos.length > 0) {
      this._chartModuleRequested = true
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
        // Interactive children must opt out, or their click starts a drag.
        filter: '.btn-close',
        preventOnFilter: false,
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

            this.data.setManualOrder(newOrder)
          }
        },
      })
    } else if (!pillsContainer && this._sortableInstance) {
      // Cleanup if the container is removed
      this._sortableInstance.destroy()
      this._sortableInstance = null
    }
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
      .map(parseIdentifier)
      .filter((r): r is RepoRef => r !== null)

    // Avoid re-fetching if the URL state exactly matches our current UI state
    const incoming = parsedRepos.map(repoIdentifier).join(',')
    if (incoming === this.data.identifiers.join(',')) {
      return
    }

    if (parsedRepos.length > 0) {
      this.data.setRepos(parsedRepos)
      this.data.fetchAll()
    } else {
      // Silently clear all state if the URL was emptied (e.g. hitting back
      // button to initial state)
      this.data.clear()
    }
  }

  private _handlePopState = () => {
    this._readStateFromURL()
  }

  private _updateURL() {
    const url = new URL(window.location.href)
    // Failed repositories are appended so a shared link still carries them.
    const failed = this.data.failedIdentifiers.filter(
      (id) => !this.data.order.includes(id)
    )
    const identifiers = [...this.data.order, ...failed]

    if (identifiers.length > 0) {
      url.searchParams.set('repos', identifiers.join(','))
    } else {
      url.searchParams.delete('repos') // Clear if no repos
    }
    history.pushState({}, '', url)
  }

  private async _getUserRepos(username: string) {
    if (!username) return

    // When we fetch, we no longer need the confirmation message
    this._repoCountForConfirm = 0
    this._userForConfirm = ''

    this._suggestionsLoading = true

    try {
      const repos = await listUserRepos(this.settings.octokit, username)
      this._repoSuggestions = repos.map((repo) => repo.name)
    } catch (error) {
      console.error('Failed to fetch user repos:', error)
      this._repoSuggestions = []
    } finally {
      this._suggestionsLoading = false
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
    this.data.error = '' // Clear previous errors

    try {
      const userData = await getUserByUsername(
        this.settings.octokit,
        this._newUsername
      )
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
          this.data.error = this.localize.t('errors.rateLimitExceeded')
        } else if (status === 404) {
          // User not found, fail silently by not setting an error message.
          this._repoSuggestions = []
        } else {
          this.data.error = this.localize.t('errors.networkError')
        }
      }
    }
  }

  private async _handleFormSubmit() {
    if (!this._newUsername || !this._newRepository) return

    const added = this.data.add({
      username: this._newUsername,
      repository: this._newRepository,
    })

    if (added) {
      trackEvent('add_repository', {
        repository: `${this._newUsername}/${this._newRepository}`,
      })
      // Await the data fetch to ensure the order is updated before the URL
      await this.data.fetchAll()
      this._updateURL()
    }

    // Reset form. Suggestions stay, they are still valid for the current user.
    this._newRepository = ''
  }

  private _handleRemoveRepo(identifier: string) {
    this.data.remove(identifier)
    this._updateURL()
  }

  private async _handleCopyReport(e: CustomEvent<string>) {
    const identifier = e.detail
    const summary = this.data.summaryData.find(
      (s) => s.identifier === identifier
    )
    if (!summary) return

    this.data.loading = true
    this.requestUpdate()
    try {
      await this.data.loadReportData(identifier)

      const markdownContent = generateSingleRepoMarkdownReport(
        summary,
        this.data.releasesData.get(identifier) || [],
        this.data.stargazersData.get(identifier) || [],
        this.data.issuesData.get(identifier) || []
      )

      await navigator.clipboard.writeText(markdownContent)
      showToast(this.localize.t('comparison.markdownCopied'))
    } catch (err) {
      console.error(err)
      this.data.error = this.localize.t('errors.repoFetchFailed')
    } finally {
      this.data.loading = false
      this.requestUpdate()
    }
  }

  private async _handleRequestSort(e: CustomEvent<SortKey>) {
    const newSortKey = e.detail
    this._authError = '' // Clear previous auth errors on any sort attempt

    if (
      (newSortKey === 'stars' ||
        newSortKey === 'openIssues' ||
        newSortKey === 'openPullRequests') &&
      !this.settings.githubToken
    ) {
      this._authError = this.localize.t('errors.authRequired')
      return
    }

    if (newSortKey === 'manual') return

    this._chartMetric = newSortKey
    await this.data.sortBy(newSortKey)
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

  /**
   * Hard reload: drops the 24h API cache and refetches everything for the
   * repos currently on screen. Lazily-loaded data (stars, issues, PRs) is
   * dropped from memory too, so it gets refetched when next needed.
   */
  private async _handleHardRefresh() {
    if (this.data.loading || this.data.repos.length === 0) return

    trackEvent('hard_refresh', { count: this.data.repos.length })

    await clearCache()
    this.data.resetLazyData()
    await this.data.fetchAll()

    if (!this.data.error && this.data.repoErrors.size === 0) {
      showToast(this.localize.t('comparison.refreshed'))
    }
  }

  private _handleClearAllRepos() {
    const clearAction = () => {
      this.data.clear()
      this._authError = ''
      // After clearing, update the URL which will also trigger a re-render to
      // the initial state
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
    if (this.data.repos.length > 0) {
      this._saveSetModal?.show()
    } else {
      alert(this.localize.t('errors.addRepoToSave'))
    }
  }

  private _handleSaveSetConfirm() {
    const input = this.querySelector('#saveSetNameInput') as HTMLInputElement
    const setName = input.value.trim()
    if (setName) {
      const identifiers = this.data.identifiers
      this.sets.save(setName, identifiers)
      trackEvent('save_set', {
        name: setName,
        count: identifiers.length,
      })
      input.value = '' // Clear input
      this._saveSetModal?.hide()
    }
  }

  private async _handleLoadSet(e: Event, setName: string) {
    e.preventDefault()
    const identifiers = this.sets.get(setName)
    if (!identifiers) return

    trackEvent('load_set', { name: setName })
    this.data.setRepos(
      identifiers.map(parseIdentifier).filter((r): r is RepoRef => r !== null)
    )
    // Await the data fetch to ensure the order is updated before the URL
    await this.data.fetchAll()
    this._updateURL()
  }

  private _handleManageSetsClick(e: Event) {
    e.preventDefault()
    this._manageSetsModal?.show()
  }

  private _handleDeleteSet(setName: string) {
    this._showConfirmation(
      this.localize.t('modals.confirmDeleteSetTitle'),
      this.localize.t('prompts.confirmDeleteSet', { setName }),
      () => {
        this.sets.delete(setName)
        trackEvent('delete_set', { name: setName })
      }
    )
  }

  private _handleUpdateSet(setName: string) {
    this.sets.update(setName, this.data.identifiers)
  }

  private _orderedSummaryData(): RepoSummary[] {
    return this.data.order
      .map((identifier) =>
        this.data.summaryData.find((d) => d.identifier === identifier)
      )
      .filter((d): d is RepoSummary => d !== undefined)
  }

  private _handleExportCsv() {
    if (this.data.summaryData.length === 0) return
    trackEvent('export_csv', { count: this.data.repos.length })

    const headers = [
      'Repository',
      'Stars',
      'Latest Version',
      'Last Update',
      'Size (KB)',
      'Total Downloads',
    ]

    const csvContent = generateCsvContent(this._orderedSummaryData(), headers)
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
    if (this.data.summaryData.length === 0) return
    trackEvent('copy_markdown', {
      event_category: 'engagement',
      event_label: 'Copy Markdown',
      repo_count: this.data.repos.length,
    })

    const headers = [
      'Repository',
      'Stars',
      'Open Issues',
      'Latest Version',
      'Total Downloads',
    ]

    const markdownContent = generateMarkdownContent(
      this._orderedSummaryData(),
      headers
    )

    navigator.clipboard.writeText(markdownContent).then(
      () => {
        showToast(this.localize.t('comparison.markdownCopied'))
      },
      (err) => {
        console.error('Could not copy text to clipboard: ', err)
      }
    )
  }

  private get _isPinned() {
    return (
      localStorage.getItem('default-dashboard') ===
      JSON.stringify(this.data.order)
    )
  }

  private _handlePinDashboard() {
    const button = this.querySelector('#pin-dashboard-button')
    if (!button) return

    if (this._isPinned) {
      localStorage.removeItem('default-dashboard')
      this.requestUpdate()
    } else {
      localStorage.setItem('default-dashboard', JSON.stringify(this.data.order))
      button.innerHTML = `<i class="bi bi-pin-fill me-sm-2"></i><span class="d-none d-sm-inline">${this.localize.t(
        'comparison.pinned'
      )}</span>`
      setTimeout(() => {
        this.requestUpdate()
      }, 2000)
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
    trackEvent('change_language', { locale: lang })
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
              ${
                Object.keys(this.sets.sets).length > 0
                  ? html`
                      <ul class="list-group">
                        ${Object.keys(this.sets.sets).map(
                          (setName) => html`
                            <li
                              class="list-group-item d-flex justify-content-between align-items-center"
                            >
                              <span class="me-2"
                                >${setName}
                                ${
                                  this.sets.justUpdated === setName
                                    ? html`<span class="badge bg-success ms-2"
                                        >${this.localize.t('modals.updated')}</span
                                      >`
                                    : ''
                                }</span
                              >
                              <div class="btn-group btn-group-sm">
                                <button
                                  class="btn btn-outline-primary"
                                  @click=${() => this._handleUpdateSet(setName)}
                                  title=${this.localize.t('modals.updateSet')}
                                  ?disabled=${this.data.repos.length === 0}
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
                    </p>`
              }
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
          ${
            this.data.repos.length === 0
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
                        ${
                          Object.keys(this.sets.sets).length > 0
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
                                    ${Object.keys(this.sets.sets).map(
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
                            : ''
                        }
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
                          this.data.order,
                          (identifier) => identifier,
                          (identifier) => {
                            const repo = this.data.repos.find(
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
                                  @click=${() =>
                                    this._handleRemoveRepo(identifier)}
                                ></button>
                              </span>
                            `
                          }
                        )}
                      </div>
                      ${
                        this.data.failedIdentifiers.length > 0
                          ? html`
                              <div class="d-flex flex-wrap gap-2">
                                ${this.data.failedIdentifiers.map(
                                  (identifier) => html`
                                    <span
                                      class="badge d-flex align-items-center p-2 text-bg-danger mw-100"
                                      title=${
                                        this.data.repoErrors.get(identifier) ??
                                        ''
                                      }
                                    >
                                      <i
                                        class="bi bi-exclamation-triangle-fill me-2 flex-shrink-0"
                                      ></i>
                                      <span class="text-truncate"
                                        >${identifier}</span
                                      >
                                      <button
                                        type="button"
                                        class="btn-close btn-close-white ms-2 flex-shrink-0"
                                        aria-label="Remove ${identifier}"
                                        @click=${() =>
                                          this._handleRemoveRepo(identifier)}
                                      ></button>
                                    </span>
                                  `
                                )}
                              </div>
                            `
                          : ''
                      }
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
                          ${
                            Object.keys(this.sets.sets).length > 0
                              ? html`<li><hr class="dropdown-divider" /></li>`
                              : ''
                          }
                          ${Object.keys(this.sets.sets).map(
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
                          ${
                            Object.keys(this.sets.sets).length > 0
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
                              : ''
                          }
                        </ul>
                      </div>
                      <button
                        id="refresh-button"
                        class="btn btn-outline-secondary"
                        aria-label=${this.localize.t('comparison.refresh')}
                        title=${this.localize.t('comparison.refresh')}
                        ?disabled=${this.data.loading}
                        @click=${this._handleHardRefresh}
                      >
                        <i
                          class="bi bi-arrow-clockwise me-lg-2"
                          aria-hidden="true"
                        ></i
                        ><span class="d-none d-lg-inline" aria-hidden="true"
                          >${this.localize.t('comparison.refresh')}</span
                        >
                      </button>
                      <button
                        id="copy-link-button"
                        class="btn btn-outline-secondary"
                        aria-label=${this.localize.t('comparison.copyLink')}
                        title=${this.localize.t('comparison.copyLink')}
                        @click=${this._handleCopyLink}
                      >
                        <i
                          class="bi bi-clipboard me-lg-2"
                          aria-hidden="true"
                        ></i
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
                            JSON.stringify(this.data.order)
                            ? 'comparison.unpinDashboard'
                            : 'comparison.pinDashboard'
                        )}
                        title=${this.localize.t(
                          localStorage.getItem('default-dashboard') ===
                            JSON.stringify(this.data.order)
                            ? 'comparison.unpinDashboard'
                            : 'comparison.pinDashboard'
                        )}
                        @click=${this._handlePinDashboard}
                      >
                        <i
                          class="bi ${
                            localStorage.getItem('default-dashboard') ===
                            JSON.stringify(this.data.order)
                              ? 'bi-pin-fill'
                              : 'bi-pin-angle'
                          } me-lg-2"
                          aria-hidden="true"
                        ></i
                        ><span class="d-none d-lg-inline" aria-hidden="true"
                          >${this.localize.t(
                            localStorage.getItem('default-dashboard') ===
                              JSON.stringify(this.data.order)
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

                  ${
                    this.data.repoErrors.size > 0
                      ? html`<div class="alert alert-danger" role="alert">
                          <strong
                            ><i class="bi bi-exclamation-triangle-fill me-2"></i
                            >${this.localize.t('errors.someReposFailed', {
                              count: this.data.repoErrors.size,
                            })}</strong
                          >
                          <ul class="mb-0 mt-2">
                            ${[...this.data.repoErrors].map(
                              ([identifier, message]) =>
                                html`<li>
                                  <code>${identifier}</code> — ${message}
                                </li>`
                            )}
                          </ul>
                        </div>`
                      : ''
                  }
                  ${
                    this.data.error
                      ? html`<div class="alert alert-warning">
                          ${this.data.error}
                        </div>`
                      : ''
                  }
                  ${
                    this.data.truncatedIdentifiers.length > 0
                      ? html`<div class="alert alert-warning" role="alert">
                          <i class="bi bi-scissors me-2"></i>${this.localize.t(
                            'charts.dataTruncated',
                            {
                              repos: this.data.truncatedIdentifiers.join(', '),
                            }
                          )}
                        </div>`
                      : ''
                  }
                  ${
                    this._authError
                      ? html`<div class="alert alert-info" role="alert">
                          <i class="bi bi-info-circle-fill me-2"></i>${
                            this._authError
                          }
                        </div>`
                      : ''
                  }

                  <summary-table
                    .summaryData=${this.data.summaryData}
                    .repoOrder=${this.data.order}
                    .sortKey=${this.data.sortKey}
                    .sortDirection=${this.data.sortDirection}
                    .showTotalDownloads=${this.settings.showTotalDownloads}
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
                    .releasesData=${this.data.releasesData}
                    .stargazersData=${this.data.stargazersData}
                    .issuesData=${this.data.issuesData}
                    .pullRequestsData=${this.data.pullRequestsData}
                    .repoOrder=${this.data.order}
                    .metric=${this._chartMetric}
                    .yAxisScale=${this._yAxisScale}
                    .filterDependabot=${this.settings.filterDependabot}
                    .limitZoomOut=${true}
                  ></chart-display>

                  <div class="accordion" id="resultsAccordion">
                    ${this.data.order.map((repoIdentifier) => {
                      const releases =
                        this.data.releasesData.get(repoIdentifier) || []
                      const totalDownloads =
                        this.data.downloadsData.get(repoIdentifier) || 0

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
                                  ><i
                                    class="bi bi-github me-2 flex-shrink-0"
                                  ></i>
                                  ${repoIdentifier}</strong
                                >
                                ${
                                  this.settings.showTotalDownloads
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
                                    : ''
                                }
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
                                .showTotalDownloads=${this.settings.showTotalDownloads}
                              ></results-display>
                            </div>
                          </div>
                        </div>
                      `
                    })}
                  </div>
                `
          }
          ${modalsTemplate} ${confirmationModalTemplate}
          <settings-modal
            .filterDependabot=${this.settings.filterDependabot}
            .showTotalDownloads=${this.settings.showTotalDownloads}
            .hidePreReleases=${this.settings.hidePreReleases}
            .githubToken=${this.settings.githubToken}
            .tokenStatus=${this.settings.tokenStatus}
            .theme=${this.settings.theme}
            @filter-dependabot-change=${(e: CustomEvent<boolean>) => {
              this.settings.setFilterDependabot(e.detail)
              this.data.fetchAll()
            }}
            @hide-pre-releases-change=${(e: CustomEvent<boolean>) => {
              this.settings.setHidePreReleases(e.detail)
              this.data.fetchAll()
            }}
            @show-total-downloads-change=${(e: CustomEvent<boolean>) => {
              this.settings.setShowTotalDownloads(e.detail)
              if (
                !this.settings.showTotalDownloads &&
                this.data.sortKey === 'totalDownloads'
              ) {
                this.data.sortKey = 'size'
                this._chartMetric = 'size'
              } else if (this.settings.showTotalDownloads) {
                this.data.sortKey = 'totalDownloads'
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
                this.settings.setTheme(newTheme)
                trackEvent('change_theme', { theme: newTheme })
              }
            }}
            @save-token=${(e: CustomEvent<string>) => {
              this.settings.setToken(e.detail)
            }}
            @clear-token=${() => this.settings.setToken('')}
          ></settings-modal>
        </div>
      </main>

      <app-footer class="mt-auto d-block w-100">
        <rate-limit-display
          .octokit=${this.settings.octokit}
        ></rate-limit-display>
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
          @click=${() => trackEvent('open_settings')}
        >
          <i class="bi bi-gear-fill"></i>
        </button>
      </div>

      ${
        this._installPrompt
          ? html`
              <div
                class="position-fixed bottom-0 end-0 p-3"
                style="z-index: 11"
              >
                <pwa-install-toast
                  .installPrompt=${this._installPrompt}
                  @install-pwa=${this._handlePwaInstall}
                  @dismiss-pwa=${this._handlePwaDismiss}
                ></pwa-install-toast>
              </div>
            `
          : ''
      }
      ${this.data.loading ? html`<loading-spinner></loading-spinner>` : ''}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'github-release-stats': GithubReleaseStats
  }
}
