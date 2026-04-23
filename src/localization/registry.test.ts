import { describe, it, expect, beforeAll } from 'bun:test'
import { t, setLocale } from './registry'

describe('Localization Registry', () => {
  beforeAll(async () => {
    // Wait for the English locale to be loaded before running tests
    await setLocale('en')
  })

  it('translates nested keys correctly', () => {
    expect(t('search.username')).toBe('Username')
    expect(t('app.title')).toBe('GitHub Release Stats')
  })

  it('returns the key itself if the translation is missing', () => {
    expect(t('non.existent.key')).toBe('non.existent.key')
    expect(t('search.nonexistent')).toBe('search.nonexistent')
  })

  it('returns the key if it resolves to an object instead of a string', () => {
    expect(t('search')).toBe('search')
  })

  it('interpolates variables correctly', () => {
    expect(t('rateLimit.remaining', { remaining: 50, limit: 60 })).toBe(
      '50 / 60 requests remaining'
    )

    expect(t('search.userHasRepos', { user: 'timmaurice', count: 10 })).toBe(
      'User <strong>timmaurice</strong> has 10 repositories.'
    )
  })

  it('leaves missing variables as placeholders', () => {
    // If a replacement is missing, it should keep the {placeholder} intact
    expect(t('rateLimit.remaining', { remaining: 50 })).toBe(
      '50 / {limit} requests remaining'
    )
  })
})
