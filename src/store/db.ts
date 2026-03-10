import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DB } from './schema.js';
import { childLogger } from '../utils/logger.js';

let _db: Kysely<DB> | null = null;

export function getDb(): Kysely<DB> {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

export function initDb(dbPath: string): Kysely<DB> {
  const log = childLogger({ component: 'db' });

  const isMemory = dbPath === ':memory:';
  if (!isMemory) {
    const resolved = path.resolve(dbPath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    log.info({ dbPath: resolved }, 'Opening SQLite database');
  }

  const sqlite = new Database(isMemory ? ':memory:' : path.resolve(dbPath));

  // Performance & safety settings
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  _db = new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
