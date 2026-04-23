import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('loading-spinner')
export class LoadingSpinner extends LitElement {
  // Disable shadow DOM to inherit global styles.
  protected createRenderRoot() {
    return this
  }

  render() {
    return html`
      <div class="scrim">
        <div class="spinner">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `
  }
}
