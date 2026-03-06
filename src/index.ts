/**
 * TicketForge — entry point
 *
 * Boot sequence:
 *  1. Load & validate config
 *  2. Init logger
 *  3. Init database + run pending migrations
 *  4. Init GitHub client
 *  5. Init OpenCode client
 *  6. Init work queue
 *  7. Start API server
 *  8. Start scheduler
 *  9. Register graceful-shutdown handlers
 */
import { getConfig } from './config/index.js';
import { createLogger, getLogger } from './utils/logger.js';
import { initDb, closeDb } from './store/db.js';
import { initGithubClient } from './github/client.js';
import { initOpencodeClient, getOpencodeClient } from './opencode/client.js';
import { initQueue } from './queue/index.js';
import { startApiServer, stopApiServer } from './api/index.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { runMigrations } from '../Kysely/migrator.js';

async function main(): Promise<void> {
  // ── 1. Config ───────────────────────────────────────────────────────────────
  const config = getConfig();

  // ── 2. Logger ───────────────────────────────────────────────────────────────
  createLogger({ level: config.logLevel, pretty: config.logPretty });
  const log = getLogger();

  log.info({ version: process.env['npm_package_version'] ?? 'unknown' }, 'TicketForge starting');

  // ── 3. Database ─────────────────────────────────────────────────────────────
  initDb(config.databasePath);
  await runMigrations();
  log.info('Database ready');

  // ── 4. GitHub client ────────────────────────────────────────────────────────
  initGithubClient(config);
  log.info({ botUsername: config.githubBotUsername }, 'GitHub client initialized');

  // ── 5. OpenCode client ──────────────────────────────────────────────────────
  initOpencodeClient({
    baseUrl: config.opencodeBaseUrl,
    apiKey: config.opencodeApiKey,
  });

  // Warn (but don't abort) if OpenCode isn't reachable yet
  const client = getOpencodeClient();
  const opencodeReachable = await client.healthCheck();
  if (!opencodeReachable) {
    log.warn({ url: config.opencodeBaseUrl }, 'OpenCode daemon not reachable — will retry on first task');
  } else {
    log.info({ url: config.opencodeBaseUrl }, 'OpenCode client connected');
  }

  // ── 6. Work queue ───────────────────────────────────────────────────────────
  initQueue(config.maxConcurrentWorkers);
  log.info({ maxConcurrent: config.maxConcurrentWorkers }, 'Work queue initialized');

  // ── 7. API server ───────────────────────────────────────────────────────────
  await startApiServer(config);

  // ── 8. Scheduler ────────────────────────────────────────────────────────────
  startScheduler();

  log.info('TicketForge is running');

  // ── 9. Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutdown signal received');

    stopScheduler();
    await stopApiServer();
    await closeDb();

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
