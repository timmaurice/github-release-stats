import { LitElement, html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import Toast from 'bootstrap/js/dist/toast'
import { LocalizeController } from '../localization/localize-controller'

@customElement('pwa-install-toast')
export class PwaInstallToast extends LitElement {
  private localize = new LocalizeController(this)

  @property({ type: Object })
  installPrompt: Event | null = null

  private _toast: Toast | null = null

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  async firstUpdated() {
    await this.updateComplete
    const toastEl = this.querySelector('.toast')
    if (toastEl) {
      this._toast = Toast.getOrCreateInstance(toastEl, { autohide: false })
      this._toast.show()
    }
  }

  private _handleInstallClick() {
    if (this.installPrompt) {
      this.dispatchEvent(new CustomEvent('install-pwa'))
    }
  }

  private _handleDismissClick() {
    this.dispatchEvent(new CustomEvent('dismiss-pwa'))
  }

  render() {
    return html`
      <div
        class="toast show align-items-center text-bg-primary border-0"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div class="d-flex">
          <div class="toast-body">${this.localize.t('pwa.installMessage')}</div>
          <button
            type="button"
            class="btn btn-primary btn-sm me-2 m-auto"
            @click=${this._handleInstallClick}
          >
            ${this.localize.t('pwa.installButton')}
          </button>
          <button
            type="button"
            class="btn-close btn-close-white me-2 m-auto"
            data-bs-dismiss="toast"
            aria-label="Close"
            @click=${this._handleDismissClick}
          ></button>
        </div>
      </div>
    `
  }
}
