import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { LocalizeController } from '../localization/localize-controller'
import { getLocale } from '../localization/registry'

@customElement('settings-modal')
export class SettingsModal extends LitElement {
  private localize = new LocalizeController(this)

  @property({ type: Boolean }) filterDependabot = false
  @property({ type: Boolean }) showTotalDownloads = true
  @property({ type: String }) githubToken = ''
  @property({ type: String }) theme = 'light'

  @state() private _localTokenInput = ''

  protected createRenderRoot() {
    return this // Disable shadow DOM for Bootstrap
  }

  protected updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('githubToken')) {
      this._localTokenInput = this.githubToken
    }
  }

  private _handleFilterDependabotChange(e: Event) {
    const input = e.target as HTMLInputElement
    this.dispatchEvent(
      new CustomEvent('filter-dependabot-change', { detail: input.checked })
    )
  }

  private _handleShowTotalDownloadsChange(e: Event) {
    const input = e.target as HTMLInputElement
    this.dispatchEvent(
      new CustomEvent('show-total-downloads-change', { detail: input.checked })
    )
  }

  private _handleLanguageChange(e: Event, lang: string) {
    e.preventDefault()
    this.dispatchEvent(new CustomEvent('language-change', { detail: lang }))
  }

  private _handleThemeChange(e: Event, theme: string) {
    e.preventDefault()
    this.dispatchEvent(new CustomEvent('theme-change', { detail: theme }))
  }

  private _handleTokenInput(e: Event) {
    const input = e.target as HTMLInputElement
    this._localTokenInput = input.value
  }

  private _handleSaveTokenFormSubmit(e: Event) {
    e.preventDefault()
    this.dispatchEvent(
      new CustomEvent('save-token', { detail: this._localTokenInput })
    )
  }

  private _handleClearToken() {
    this._localTokenInput = ''
    this.dispatchEvent(new CustomEvent('clear-token'))
  }

  render() {
    return html`
      <!-- Settings Modal -->
      <div
        class="modal fade"
        id="settingsModal"
        tabindex="-1"
        aria-labelledby="settingsModalLabel"
        aria-hidden="true"
      >
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="settingsModalLabel">
                <i class="bi bi-gear-fill me-2"></i>${this.localize.t(
                  'settings.title'
                ) || 'Settings'}
              </h5>
              <button
                type="button"
                class="btn-close"
                data-bs-dismiss="modal"
                aria-label=${this.localize.t('modals.close')}
              ></button>
            </div>
            <div class="modal-body">
              <!-- General Settings -->
              <h6 class="border-bottom pb-2 mb-3">
                ${this.localize.t('settings.general') || 'General'}
              </h6>

              <div class="mb-4">
                <div
                  class="d-flex justify-content-between align-items-center mb-3"
                >
                  <label class="form-check-label">
                    ${this.localize.t('app.language') || 'Language'}
                  </label>
                  <div class="dropdown">
                    <button
                      class="btn btn-outline-secondary dropdown-toggle btn-sm"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <i class="bi bi-translate me-2"></i>
                      ${getLocale() === 'de'
                        ? 'Deutsch'
                        : getLocale() === 'zh-CN'
                          ? '简体中文'
                          : 'English'}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li>
                        <a
                          class="dropdown-item ${getLocale() === 'en'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleLanguageChange(e, 'en')}
                          >English</a
                        >
                      </li>
                      <li>
                        <a
                          class="dropdown-item ${getLocale() === 'de'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleLanguageChange(e, 'de')}
                          >Deutsch</a
                        >
                      </li>
                      <li>
                        <a
                          class="dropdown-item ${getLocale() === 'zh-CN'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleLanguageChange(e, 'zh-CN')}
                          >简体中文</a
                        >
                      </li>
                    </ul>
                  </div>
                </div>

                <div
                  class="d-flex justify-content-between align-items-center mb-3"
                >
                  <label class="form-check-label">
                    ${this.localize.t('settings.theme') || 'Theme'}
                  </label>
                  <div class="dropdown">
                    <button
                      class="btn btn-outline-secondary dropdown-toggle btn-sm"
                      type="button"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <i
                        class="bi ${this.theme === 'light'
                          ? 'bi-sun-fill'
                          : this.theme === 'dark'
                            ? 'bi-moon-stars-fill'
                            : 'bi-display'} me-2"
                      ></i>
                      ${this.theme === 'light'
                        ? this.localize.t('settings.themeLight') || 'Light Mode'
                        : this.theme === 'dark'
                          ? this.localize.t('settings.themeDark') || 'Dark Mode'
                          : this.localize.t('settings.themeAuto') ||
                            'Auto (System Default)'}
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                      <li>
                        <a
                          class="dropdown-item ${this.theme === 'auto'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleThemeChange(e, 'auto')}
                        >
                          <i class="bi bi-display me-2"></i>
                          ${this.localize.t('settings.themeAuto') ||
                          'Auto (System Default)'}
                        </a>
                      </li>
                      <li>
                        <a
                          class="dropdown-item ${this.theme === 'light'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleThemeChange(e, 'light')}
                        >
                          <i class="bi bi-sun-fill me-2"></i>
                          ${this.localize.t('settings.themeLight') ||
                          'Light Mode'}
                        </a>
                      </li>
                      <li>
                        <a
                          class="dropdown-item ${this.theme === 'dark'
                            ? 'active'
                            : ''}"
                          href="#"
                          @click=${(e: Event) =>
                            this._handleThemeChange(e, 'dark')}
                        >
                          <i class="bi bi-moon-stars-fill me-2"></i>
                          ${this.localize.t('settings.themeDark') ||
                          'Dark Mode'}
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Table Options -->
              <h6 class="border-bottom pb-2 mb-3 mt-4">
                ${this.localize.t('settings.tableOptions') || 'Table Options'}
              </h6>
              <div class="mb-4">
                <div class="form-check form-switch mb-3">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="filterDependabotSwitch"
                    .checked=${this.filterDependabot}
                    @change=${this._handleFilterDependabotChange}
                  />
                  <label class="form-check-label" for="filterDependabotSwitch">
                    ${this.localize.t('settings.filterDependabot') ||
                    'Filter Dependabot PRs'}
                  </label>
                </div>

                <div class="form-check form-switch mb-4">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    id="showTotalDownloadsSwitch"
                    .checked=${this.showTotalDownloads}
                    @change=${this._handleShowTotalDownloadsChange}
                  />
                  <label
                    class="form-check-label"
                    for="showTotalDownloadsSwitch"
                  >
                    ${this.localize.t('settings.showTotalDownloads') ||
                    'Show Total Downloads column'}
                  </label>
                </div>
              </div>

              <!-- API Authentication -->
              <h6 class="border-bottom pb-2 mb-3 mt-4">
                ${this.localize.t('settings.apiAuth')}
              </h6>
              <p class="text-muted small">
                ${unsafeHTML(this.localize.t('settings.apiAuthDescription'))}
              </p>
              <div class="mb-3">
                <strong>${this.localize.t('settings.status')}</strong>
                ${this.githubToken
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
                    .value=${this._localTokenInput}
                    @input=${this._handleTokenInput}
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
  }
}
