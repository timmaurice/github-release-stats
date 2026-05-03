import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { LocalizeController } from '../localization/localize-controller'

@customElement('app-footer')
export class AppFooter extends LitElement {
  private localize = new LocalizeController(this)

  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  render() {
    return html`
      <footer class="footer bg-body-tertiary border-top">
        <div
          class="container d-flex justify-content-between align-items-center flex-wrap gap-2 py-3"
        >
          <div class="d-flex align-items-center flex-wrap gap-3">
            <span class="text-muted"
              >${unsafeHTML(this.localize.t('app.madeWith'))}</span
            >
            <a
              href="https://github.com/timmaurice/github-release-stats"
              target="_blank"
              rel="noopener noreferrer"
              class="text-muted text-decoration-none d-flex align-items-center gap-1"
              title=${this.localize.t('app.githubLinkTitle')}
              data-umami-event="click-source-code"
            >
              <i class="bi bi-github"></i> ${this.localize.t('app.githubLink')}
            </a>
          </div>
          <slot></slot>
        </div>
      </footer>
    `
  }
}
