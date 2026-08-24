import type { ReactiveController, ReactiveControllerHost } from 'lit'
import { Octokit } from '@octokit/rest'

export type ThemeSetting = 'light' | 'dark' | 'auto'

const THEME_KEY = 'theme'
const TOKEN_KEY = 'github-token'
const FILTER_DEPENDABOT_KEY = 'filterDependabot'
const SHOW_TOTAL_DOWNLOADS_KEY = 'showTotalDownloads'

function isTheme(value: string | null): value is ThemeSetting {
  return value === 'light' || value === 'dark' || value === 'auto'
}

/**
 * Owns everything the user can configure: theme, API token (and therefore the
 * Octokit client) and the display toggles. Persisting to localStorage and
 * reacting to the system colour scheme live here rather than in the host.
 */
export class SettingsController implements ReactiveController {
  private host: ReactiveControllerHost
  private onTokenChange: () => void

  octokit: Octokit
  theme: ThemeSetting = 'auto'
  githubToken = ''
  filterDependabot = false
  showTotalDownloads = true

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
}
