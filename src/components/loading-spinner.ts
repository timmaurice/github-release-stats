import { LitElement, html, css } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('loading-spinner')
export class LoadingSpinner extends LitElement {
  static styles = css`
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1060; /* High z-index to be on top of everything */
    }
  `

  render() {
    return html`
      <div class="overlay">
        <div
          class="spinner-border text-light"
          style="width: 3rem; height: 3rem;"
          role="status"
        >
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `
  }
}
