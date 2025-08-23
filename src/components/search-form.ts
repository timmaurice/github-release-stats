import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('search-form')
export class SearchForm extends LitElement {
  @property({ type: String }) username = ''
  @property({ type: String }) repository = ''
  @property({ type: Array }) suggestions: string[] = []
  @property({ type: String }) buttonText = 'Get Stats'
  @property({ type: Boolean }) suggestionsLoading = false

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  private _handleUsernameInput(e: Event) {
    const target = e.target as HTMLInputElement
    this.dispatchEvent(
      new CustomEvent('username-input', { detail: target.value })
    )
  }

  private _handleUsernameChange(e: Event) {
    const target = e.target as HTMLInputElement
    if (target.value) {
      this.dispatchEvent(new CustomEvent('username-change'))
    }
  }

  private _handleRepoInput(e: Event) {
    const target = e.target as HTMLInputElement
    this.dispatchEvent(
      new CustomEvent('repository-input', { detail: target.value })
    )
  }

  private _handleSubmit(e: Event) {
    e.preventDefault()
    this.dispatchEvent(new CustomEvent('form-submit'))
  }

  render() {
    return html`
      <form @submit=${this._handleSubmit}>
        <div class="row g-2 align-items-center">
          <div class="col-lg">
            <label for="username-input" class="visually-hidden">Username</label>
            <div class="input-group">
              <span class="input-group-text" title="Username"
                ><i class="bi bi-person-fill"></i
              ></span>
              <input
                id="username-input"
                type="text"
                class="form-control"
                placeholder="Username"
                .value=${this.username}
                @input=${this._handleUsernameInput}
                @change=${this._handleUsernameChange}
                required
              />
            </div>
          </div>
          <div class="col-lg">
            <label for="repository-input" class="visually-hidden"
              >Repository</label
            >
            <div class="input-group">
              <span class="input-group-text" title="Repository">
                ${this.suggestionsLoading
                  ? html`<span
                      class="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>`
                  : html`<i class="bi bi-journal-code"></i>`}
              </span>
              <input
                id="repository-input"
                type="text"
                class="form-control"
                placeholder="Repository"
                list="repo-suggestions"
                ?disabled=${this.suggestionsLoading}
                .value=${this.repository}
                @input=${this._handleRepoInput}
                required
              />
            </div>
          </div>
          <div class="col-lg-auto">
            <button type="submit" class="btn btn-primary w-100">
              <i class="bi bi-bar-chart-line-fill me-2"></i>${this.buttonText}
            </button>
          </div>
        </div>
        <datalist id="repo-suggestions">
          ${this.suggestions.map((s) => html`<option value=${s}></option>`)}
        </datalist>
      </form>
    `
  }
}
