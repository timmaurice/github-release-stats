import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('app-header')
export class AppHeader extends LitElement {
  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  render() {
    return html`
      <header>
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
          <div class="container">
            <a class="navbar-brand" href="/">
              <i class="bi bi-github"></i>
              GitHub Release Stats
            </a>
          </div>
        </nav>
      </header>
    `
  }
}
