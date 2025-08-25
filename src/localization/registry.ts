let currentLocale = localStorage.getItem('language') || 'en'

interface Translations {
  [key: string]: string | Translations
}
let translations: Translations = {}
const subscribers = new Set<() => void>()
let isInitialLoadComplete = false

async function loadTranslations(locale: string) {
  try {
    const module = await import(`./locales/${locale}.json`)
    translations = module.default
    document.documentElement.lang = locale
  } catch (e) {
    console.error(`Could not load translations for ${locale}`, e)
    if (locale !== 'en') {
      // Fallback to English
      await loadTranslations('en')
      currentLocale = 'en'
    }
  }
}

export function t(
  key: string,
  replacements?: { [key: string]: string | number }
): string {
  const keys = key.split('.')
  let result: string | Translations | undefined = translations
  for (const k of keys) {
    if (typeof result === 'object' && result !== null) {
      result = result[k]
    } else {
      result = undefined
    }

    if (result === undefined) {
      if (isInitialLoadComplete) {
        console.warn(`Translation not found for key: ${key}`)
      }
      return key
    }
  }

  if (typeof result === 'string') {
    if (replacements) {
      return result.replace(/\{(\w+)\}/g, (placeholder, placeholderKey) => {
        return String(replacements[placeholderKey] ?? placeholder)
      })
    }
    return result
  }

  // The key points to an object, not a string, which is an issue.
  console.warn(`Translation for key '${key}' is not a string.`)
  return key
}

export async function setLocale(locale: string) {
  currentLocale = locale
  localStorage.setItem('language', locale)
  await loadTranslations(locale)
  isInitialLoadComplete = true
  subscribers.forEach((cb) => cb())
}

export function getLocale() {
  return currentLocale
}

export function addSubscriber(callback: () => void) {
  subscribers.add(callback)
}

export function removeSubscriber(callback: () => void) {
  subscribers.delete(callback)
}

// Initial load
loadTranslations(currentLocale).then(() => {
  isInitialLoadComplete = true
  subscribers.forEach((cb) => cb())
})
