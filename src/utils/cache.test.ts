import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'
import { clearCache, getCache, setCache, touchCache } from './cache'

afterEach(() => {
  setSystemTime()
})

describe('cache', () => {
  it('round-trips a value', async () => {
    await setCache('round-trip', { hello: 'world' })
    const entry = await getCache<{ hello: string }>('round-trip')
    expect(entry?.data).toEqual({ hello: 'world' })
    expect(typeof entry?.timestamp).toBe('number')
  })

  it('returns null for an unknown key', async () => {
    expect(await getCache('never-written')).toBeNull()
  })

  it('stores the etag and truncation flag alongside the payload', async () => {
    await setCache('with-meta', [1, 2, 3], { etag: 'W/"abc"', truncated: true })
    const entry = await getCache<number[]>('with-meta')
    expect(entry?.etag).toBe('W/"abc"')
    expect(entry?.truncated).toBe(true)
  })

  it('omits absent metadata rather than storing undefined', async () => {
    await setCache('no-meta', 'value')
    const entry = await getCache<string>('no-meta')
    expect(entry).not.toHaveProperty('etag')
    expect(entry).not.toHaveProperty('truncated')
  })

  it('refreshes the timestamp on touch while keeping data and etag', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await setCache('touched', { n: 1 }, { etag: 'W/"v1"', truncated: true })

    setSystemTime(new Date('2026-01-02T00:00:00Z'))
    await touchCache('touched')

    const entry = await getCache<{ n: number }>('touched')
    expect(entry?.timestamp).toBe(new Date('2026-01-02T00:00:00Z').getTime())
    expect(entry?.data).toEqual({ n: 1 })
    expect(entry?.etag).toBe('W/"v1"')
    expect(entry?.truncated).toBe(true)
  })

  it('ignores a touch for a key that was never cached', async () => {
    await touchCache('missing-key')
    expect(await getCache('missing-key')).toBeNull()
  })

  it('drops every entry on clear', async () => {
    await setCache('doomed-a', 1)
    await setCache('doomed-b', 2)
    await clearCache()
    expect(await getCache('doomed-a')).toBeNull()
    expect(await getCache('doomed-b')).toBeNull()
  })
})
