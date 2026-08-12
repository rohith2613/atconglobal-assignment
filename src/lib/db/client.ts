import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config } from '../config'
import { SCHEMA_SQL } from './schema'

let db: Database.Database | null = null

function open(path: string): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(resolve(path)), { recursive: true })
  }
  const d = new Database(path)
  // WAL lets the SSE reader and the pipeline writer coexist without the reader
  // blocking. Without it, streaming progress while the pipeline writes locks up.
  if (path !== ':memory:') d.pragma('journal_mode = WAL')
  d.pragma('foreign_keys = ON')
  d.exec(SCHEMA_SQL)
  return d
}

export function getDb(): Database.Database {
  if (!db) db = open(config.dbPath)
  return db
}

/** Test hook: swap in a fresh database, usually ':memory:'. */
export function resetDbForTests(path = ':memory:'): void {
  db?.close()
  db = open(path)
}

export function closeDb(): void {
  db?.close()
  db = null
}
