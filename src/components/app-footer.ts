import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { LocalizeController } from '../localization/localize-controller'

@customElement('app-footer')
export class AppFooter extends LitElement {
  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }
  private localize = new LocalizeController(this)

  render() {
    return html`
      <footer class="footer mt-auto bg-body-tertiary border-top">
        <div
          class="container d-flex justify-content-between align-items-center flex-wrap gap-2 py-3"
        >
          <span class="text-muted"
            >${unsafeHTML(this.localize.t('app.madeWith'))}</span
          >
          <slot></slot>
        </div>
      </footer>
    `
  }
}
