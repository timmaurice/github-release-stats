declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event',
      targetIdOrAction: string,
      config?: Record<string, unknown>
    ) => void
  }
}

// IMPORTANT: Replace with your actual Google Analytics Measurement ID
const GA_MEASUREMENT_ID = 'G-J1YXS9SNGW'

/**
 * Tracks a page view with Google Analytics. This should be called whenever
 * the URL changes in a single-page application.
 */
export function trackPageView(): void {
  if (typeof window.gtag !== 'function') {
    return
  }
  window.gtag('config', GA_MEASUREMENT_ID, {
    page_path: window.location.pathname + window.location.search,
  })
}

/**
 * Tracks a custom event with Google Analytics.
 * @param action - The event action (e.g., 'add_repository').
 * @param params - The event parameters.
 */
export function trackEvent(
  action: string,
  params: Record<string, unknown>
): void {
  if (typeof window.gtag !== 'function') {
    return
  }
  window.gtag('event', action, params)
}
