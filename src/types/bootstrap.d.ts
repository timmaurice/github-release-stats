declare module 'bootstrap' {
  export class Modal {
    constructor(element: Element, options?: Record<string, unknown>)
    show(): void
    hide(): void
    static getInstance(element: Element): Modal | null
    static getOrCreateInstance(
      element: Element,
      options?: Record<string, unknown>
    ): Modal
  }
  export class Dropdown {
    constructor(element: Element, options?: Record<string, unknown>)
    static getOrCreateInstance(
      element: Element,
      options?: Record<string, unknown>
    ): Dropdown
  }
  export class Collapse {
    constructor(element: Element, options?: Record<string, unknown>)
    static getInstance(element: Element): Collapse | null
    static getOrCreateInstance(
      element: Element,
      options?: Record<string, unknown>
    ): Collapse
  }
}
