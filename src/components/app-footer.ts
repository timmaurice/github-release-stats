import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('app-footer')
export class AppFooter extends LitElement {
  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  render() {
    return html`
      <footer class="footer mt-auto bg-body-tertiary border-top">
        <div
          class="container d-flex justify-content-between align-items-center flex-wrap gap-2 py-3"
        >
          <span class="text-muted"
            >Made with <i class="bi bi-heart-fill text-danger"></i> using Lit &
            Bootstrap.</span
          >
          <slot></slot>
        </div>
      </footer>
    `
  }
}
