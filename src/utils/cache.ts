import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'github-release-stats-db'
const DB_VERSION = 2
const STORE_NAME = 'api-cache'

/** A single cached API response. */
export interface CacheEntry<T> {
  timestamp: number
  data: T
  etag?: string
  truncated?: boolean
}

export interface CacheMeta {
  etag?: string
  truncated?: boolean
}

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Bump DB_VERSION whenever a cached payload changes shape.
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }
        db.createObjectStore(STORE_NAME)
      },
    })
  }
  return dbPromise
}

export async function getCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await getDB()
    const val = await db.get(STORE_NAME, key)
    if (val) {
      return val as CacheEntry<T>
    }
  } catch (err) {
    console.error('Failed to read from cache:', err)
  }
  return null
}

export async function setCache<T>(
  key: string,
  data: T,
  meta: CacheMeta = {}
): Promise<void> {
  try {
    const db = await getDB()
    const entry: CacheEntry<T> = { timestamp: Date.now(), data }
    if (meta.etag) entry.etag = meta.etag
    if (meta.truncated) entry.truncated = true
    await db.put(STORE_NAME, entry, key)
  } catch (err) {
    console.error('Failed to write to cache:', err)
  }
}

/** Marks an entry as fresh again without rewriting its payload. */
export async function touchCache(key: string): Promise<void> {
  try {
    const db = await getDB()
    const existing = (await db.get(STORE_NAME, key)) as
      CacheEntry<unknown> | undefined
    if (!existing) return
    await db.put(STORE_NAME, { ...existing, timestamp: Date.now() }, key)
  } catch (err) {
    console.error('Failed to refresh cache entry:', err)
  }
}

/**
 * Removes every entry from the API cache, so the next fetch goes to GitHub again.
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await getDB()
    await db.clear(STORE_NAME)
  } catch (err) {
    console.error('Failed to clear cache:', err)
  }
}
