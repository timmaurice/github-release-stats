import Toast from 'bootstrap/js/dist/toast'
import { html, render } from 'lit'

/**
 * Displays a non-intrusive Bootstrap toast notification in the bottom right corner.
 * The toast is automatically removed from the DOM after it disappears.
 *
 * @param message - The text message to display inside the toast.
 */
export function showToast(message: string) {
  let container = document.getElementById('notification-toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'notification-toast-container'
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3'
    container.style.zIndex = '1100'
    document.body.appendChild(container)
  }

  const wrapper = document.createElement('div')
  render(
    html`
      <div
        class="toast align-items-center text-bg-success border-0"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div class="d-flex">
          <div class="toast-body">
            <i class="bi bi-check-circle me-2"></i>${message}
          </div>
          <button
            type="button"
            class="btn-close btn-close-white me-2 m-auto"
            data-bs-dismiss="toast"
            aria-label="Close"
          ></button>
        </div>
      </div>
    `,
    wrapper
  )

  const toastEl = wrapper.firstElementChild as HTMLElement

  container.appendChild(toastEl)

  const toast = new Toast(toastEl)
  toast.show()

  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove()
    if (container && container.childNodes.length === 0) {
      container.remove()
    }
  })
}
