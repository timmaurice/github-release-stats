import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import { LocalizeController } from '../localization/localize-controller'

@customElement('app-header')
export class AppHeader extends LitElement {
  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }
  private localize = new LocalizeController(this)

  render() {
    return html`
      <header>
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
          <div class="container">
            <a class="navbar-brand" href="/github-release-stats/">
              <i class="bi bi-github"></i>
              ${this.localize.t('app.title')}
            </a>
          </div>
        </nav>
      </header>
    `
  }
}
