/**
 * Drops and recreates all tables — wipes all state.
 * Usage: tsx scripts/reset-db.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../src/config/index.js';
import { createLogger } from '../src/utils/logger.js';
import { initDb, closeDb } from '../src/store/db.js';
import { runMigrations } from '../Kysely/migrator.js';

async function main(): Promise<void> {
  const config = getConfig();
  createLogger({ level: 'info', pretty: true });

  const dbPath = path.resolve(config.databasePath);

  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath);
    console.log(`Deleted ${dbPath}`);

    // Also remove WAL/SHM sidecar files if present
    for (const ext of ['-wal', '-shm']) {
      const sidecar = dbPath + ext;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
    }
  } else {
    console.log('No database file found — creating fresh.');
  }

  initDb(config.databasePath);
  await runMigrations();

  await closeDb();
  console.log('Database reset complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
