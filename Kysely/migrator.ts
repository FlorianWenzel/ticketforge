import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Migrator, FileMigrationProvider } from 'kysely';
import fs from 'node:fs/promises';
import { getDb } from '../src/store/db.js';
import { childLogger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const log = childLogger({ component: 'migrator' });
  const db = getDb();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      log.info({ migration: result.migrationName }, 'Migration applied');
    } else if (result.status === 'Error') {
      log.error({ migration: result.migrationName }, 'Migration failed');
    }
  }

  if (error) {
    throw new Error(`Migration failed: ${error}`);
  }
}

export async function rollbackLastMigration(): Promise<void> {
  const log = childLogger({ component: 'migrator' });
  const db = getDb();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results } = await migrator.migrateDown();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      log.info({ migration: result.migrationName }, 'Migration rolled back');
    } else if (result.status === 'Error') {
      log.error({ migration: result.migrationName }, 'Rollback failed');
    }
  }

  if (error) {
    throw new Error(`Rollback failed: ${error}`);
  }
}
