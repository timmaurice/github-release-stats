import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { Octokit } from '@octokit/rest'
import { formatDistanceToNow } from 'date-fns'
import { LocalizeController } from '../localization/localize-controller.js'

@customElement('rate-limit-display')
export class RateLimitDisplay extends LitElement {
  @property({ attribute: false })
  octokit?: Octokit
  private localize = new LocalizeController(this)

  @state() private _limit = 0
  @state() private _remaining = 0
  @state() private _reset = 0
  @state() private _error = ''
  @state() private _loading = false
  @state() private _lastUpdated: Date | null = null

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  connectedCallback(): void {
    super.connectedCallback()
    this._fetchRateLimit()
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('octokit') && this.octokit) {
      this._fetchRateLimit()
    }
  }

  private async _fetchRateLimit() {
    if (!this.octokit) return
    this._loading = true
    try {
      const { data } = await this.octokit.rest.rateLimit.get()
      // We are interested in the 'core' limit for REST API calls
      const coreLimit = data.resources.core
      this._limit = coreLimit.limit
      this._remaining = coreLimit.remaining
      this._reset = coreLimit.reset
      this._error = ''
      this._lastUpdated = new Date()
    } catch (error) {
      console.error('Failed to fetch rate limit:', error)
      this._error = this.localize.t('rateLimit.error')
      this._lastUpdated = null
    } finally {
      this._loading = false
    }
  }

  private _getResetTime(): string {
    if (!this._reset) return ''
    // The reset time from GitHub is in UTC seconds, Date expects milliseconds.
    const resetDate = new Date(this._reset * 1000)
    return formatDistanceToNow(resetDate, { addSuffix: true })
  }

  private _getLastUpdatedTime(): string {
    if (!this._lastUpdated) return ''
    return formatDistanceToNow(this._lastUpdated, { addSuffix: true })
  }

  private _getUsagePercentage(): number {
    if (this._limit === 0) return 0
    const used = this._limit - this._remaining
    return (used / this._limit) * 100
  }

  render() {
    if (this._error) {
      return html`<span class="text-muted small">${this._error}</span>`
    }

    const percentage = this._getUsagePercentage()
    let progressBarClass = 'bg-success'
    if (percentage > 85) {
      progressBarClass = 'bg-danger'
    } else if (percentage > 60) {
      progressBarClass = 'bg-warning'
    }

    const lastUpdatedText = this._lastUpdated
      ? html`<div class="text-muted mb-1" style="font-size: 0.75em;">
          ${this.localize.t('rateLimit.updated', {
            time: this._getLastUpdatedTime(),
          })}
        </div>`
      : ''

    return html`
      <div
        class="container d-flex align-items-center gap-2 mb-5"
        style="min-width: 300px;"
      >
        <div class="flex-grow-1">
          ${lastUpdatedText}
          <div
            class="progress"
            style="height: 10px;"
            title="${this.localize.t('rateLimit.remaining', {
              remaining: this._remaining,
              limit: this._limit,
            })}"
          >
            <div
              class="progress-bar ${progressBarClass}"
              role="progressbar"
              style="width: ${percentage}%"
            ></div>
          </div>
        </div>
        <div class="text-muted small text-nowrap">
          ${this._loading
            ? html`<span
                class="spinner-border spinner-border-sm"
                role="status"
              ></span>`
            : html`<button
                  class="btn btn-sm btn-link py-0 px-1"
                  @click=${this._fetchRateLimit}
                  title="Refresh rate limit"
                >
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
                ${this.localize.t('rateLimit.resets', {
                  time: this._getResetTime(),
                })}`}
        </div>
      </div>
    `
  }
}
