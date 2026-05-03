declare global {
  interface Window {
    umami?: {
      track: {
        (eventName: string, eventData?: Record<string, unknown>): void
        (eventData: Record<string, unknown>): void
      }
    }
  }
}

/**
 * Tracks a custom event with Umami.
 * @param eventName - The name of the event (e.g., 'add_repository').
 * @param eventData - Optional metadata for the event.
 */
export function trackEvent(
  eventName: string,
  eventData?: Record<string, unknown>
): void {
  if (typeof window.umami?.track === 'function') {
    window.umami.track(eventName, eventData)
  }
}

// Initialize Umami Analytics
const initUmami = () => {
  if (typeof document !== 'undefined') {
    // Avoid double injection
    if (document.querySelector('script[src*="umami.is/script.js"]')) {
      return
    }

    const script = document.createElement('script')
    script.defer = true
    script.src = 'https://cloud.umami.is/script.js'
    script.setAttribute(
      'data-website-id',
      '19375596-a853-42c5-9914-d5e6dcece04b'
    )
    script.setAttribute('data-domains', 'timmaurice.github.io')
    script.setAttribute('data-do-not-track', 'true')
    document.head.appendChild(script)
  }
}

initUmami()
