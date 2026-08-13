/**
 * Drops the local database so the next boot restores the committed run.
 *
 * Exists so a demo take starts identically every time — nothing half-run, no
 * consultant marks left on claims from the previous rehearsal.
 *
 * Run: npm run reset
 */
import 'dotenv/config'
import { existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config } from '../src/lib/config'

const db = resolve(config.dbPath)
const dir = dirname(db)

if (!existsSync(db)) {
  console.log('Nothing to reset — no database yet. The committed run loads on first boot.')
} else {
  // WAL leaves -wal and -shm beside the database; removing only the main file
  // leaves the previous state recoverable and the reset incomplete.
  for (const f of [db, `${db}-wal`, `${db}-shm`]) {
    if (existsSync(f)) rmSync(f, { force: true })
  }
  console.log(`Removed ${db}`)
}

console.log('Next `npm run dev` restores the saved Nordwind run from fixtures/demo-run.json.')
console.log(`(database directory: ${dir})`)
