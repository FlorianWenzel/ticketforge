/**
 * Standalone migration runner.
 * Usage:
 *   tsx scripts/migrate.ts          # migrate to latest
 *   tsx scripts/migrate.ts down     # rollback last
 */
import 'dotenv/config';
import { getConfig } from '../src/config/index.js';
import { createLogger } from '../src/utils/logger.js';
import { initDb } from '../src/store/db.js';
import { runMigrations, rollbackLastMigration } from '../Kysely/migrator.js';

async function main(): Promise<void> {
  const config = getConfig();
  createLogger({ level: config.logLevel, pretty: true });
  initDb(config.databasePath);

  const direction = process.argv[2];

  if (direction === 'down') {
    await rollbackLastMigration();
    console.log('Rollback complete');
  } else {
    await runMigrations();
    console.log('Migrations complete');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
