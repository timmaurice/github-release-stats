import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { Octokit } from '@octokit/rest'

export type ThemeSetting = 'light' | 'dark' | 'auto'

export type TokenStatus =
  'anonymous' | 'checking' | 'valid' | 'invalid' | 'unverified'

const THEME_KEY = 'theme'
const TOKEN_KEY = 'github-token'
const FILTER_DEPENDABOT_KEY = 'filterDependabot'
const SHOW_TOTAL_DOWNLOADS_KEY = 'showTotalDownloads'
const HIDE_PRE_RELEASES_KEY = 'hidePreReleases'

function isTheme(value: string | null): value is ThemeSetting {
  return value === 'light' || value === 'dark' || value === 'auto'
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

/** Owns the user's configuration and the Octokit client built from the token. */
export class SettingsController implements ReactiveController {
  private host: ReactiveControllerHost
  private onTokenChange: () => void

  octokit: Octokit
  theme: ThemeSetting = 'auto'
  githubToken = ''
  tokenStatus: TokenStatus = 'anonymous'
  filterDependabot = false
  showTotalDownloads = true
  hidePreReleases = false

  constructor(host: ReactiveControllerHost, onTokenChange: () => void) {
    this.host = host
    this.onTokenChange = onTokenChange
    host.addController(this)

    this.githubToken = localStorage.getItem(TOKEN_KEY) || ''
    this.octokit = new Octokit({ auth: this.githubToken || undefined })

    const storedTheme = localStorage.getItem(THEME_KEY)
    if (isTheme(storedTheme)) {
      this.theme = storedTheme
    } else if (storedTheme !== null) {
      localStorage.removeItem(THEME_KEY) // clear invalid values
    }
    this.applyTheme()

    const storedFilter = localStorage.getItem(FILTER_DEPENDABOT_KEY)
    if (storedFilter !== null) {
      this.filterDependabot = storedFilter === 'true'
    }

    const storedDownloads = localStorage.getItem(SHOW_TOTAL_DOWNLOADS_KEY)
    if (storedDownloads !== null) {
      this.showTotalDownloads = storedDownloads === 'true'
    }

    const storedPreReleases = localStorage.getItem(HIDE_PRE_RELEASES_KEY)
    if (storedPreReleases !== null) {
      this.hidePreReleases = storedPreReleases === 'true'
    }

    this.verifyToken()
  }

  /** Asks GitHub whether it accepts the token. */
  async verifyToken() {
    if (!this.githubToken) {
      this.tokenStatus = 'anonymous'
      this.host.requestUpdate()
      return
    }

    this.tokenStatus = 'checking'
    this.host.requestUpdate()

    const octokit = this.octokit
    try {
      await octokit.rest.rateLimit.get()
      if (octokit !== this.octokit) return
      this.tokenStatus = 'valid'
    } catch (error) {
      if (octokit !== this.octokit) return
      console.error('Failed to verify the GitHub token:', error)
      this.tokenStatus = statusOf(error) === 401 ? 'invalid' : 'unverified'
    }
    this.host.requestUpdate()
  }

  hostConnected() {
    this.darkModeQuery.addEventListener('change', this.handleSystemThemeChange)
  }

  hostDisconnected() {
    this.darkModeQuery.removeEventListener(
      'change',
      this.handleSystemThemeChange
    )
  }

  private get darkModeQuery() {
    return window.matchMedia('(prefers-color-scheme: dark)')
  }

  private handleSystemThemeChange = () => {
    if (this.theme === 'auto') {
      this.applyTheme()
    }
  }

  applyTheme() {
    const resolved =
      this.theme === 'auto'
        ? this.darkModeQuery.matches
          ? 'dark'
          : 'light'
        : this.theme
    document.documentElement.setAttribute('data-bs-theme', resolved)
  }

  setTheme(theme: ThemeSetting) {
    this.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    this.applyTheme()
    this.host.requestUpdate()
  }

  setToken(token: string) {
    this.githubToken = token
    this.octokit = new Octokit({ auth: token || undefined })
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
    this.host.requestUpdate()
    this.verifyToken()
    this.onTokenChange()
  }

  setFilterDependabot(value: boolean) {
    this.filterDependabot = value
    localStorage.setItem(FILTER_DEPENDABOT_KEY, String(value))
    this.host.requestUpdate()
  }

  setShowTotalDownloads(value: boolean) {
    this.showTotalDownloads = value
    localStorage.setItem(SHOW_TOTAL_DOWNLOADS_KEY, String(value))
    this.host.requestUpdate()
  }

  setHidePreReleases(value: boolean) {
    this.hidePreReleases = value
    localStorage.setItem(HIDE_PRE_RELEASES_KEY, String(value))
    this.host.requestUpdate()
  }
}
