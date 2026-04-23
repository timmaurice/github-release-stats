// src/types/bootstrap.d.ts

declare module 'bootstrap/js/dist/toast' {
  import { BaseComponent } from 'bootstrap'

  interface ToastOptions {
    animation?: boolean
    autohide?: boolean
    delay?: number
  }

  class Toast extends BaseComponent {
    constructor(element: string | Element, options?: ToastOptions)
    show(): void
    hide(): void
    dispose(): void
    static getInstance(element: string | Element): Toast | null
    static getOrCreateInstance(
      element: string | Element,
      options?: ToastOptions
    ): Toast
  }

  export default Toast
}
