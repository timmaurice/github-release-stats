import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'github-release-stats-db'
const DB_VERSION = 1
const STORE_NAME = 'api-cache'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      },
    })
  }
  return dbPromise
}

export async function getCache<T>(
  key: string
): Promise<{ timestamp: number; data: T } | null> {
  try {
    const db = await getDB()
    const val = await db.get(STORE_NAME, key)
    if (val) {
      return val as { timestamp: number; data: T }
    }
  } catch (err) {
    console.error('Failed to read from cache:', err)
  }
  return null
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDB()
    await db.put(STORE_NAME, { timestamp: Date.now(), data }, key)
  } catch (err) {
    console.error('Failed to write to cache:', err)
  }
}
