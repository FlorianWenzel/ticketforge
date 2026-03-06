import { z } from 'zod';
import 'dotenv/config';

// ─── Schema ───────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  // GitHub
  githubToken: z.string().min(1, 'GITHUB_TOKEN is required'),
  githubBotUsername: z.string().min(1, 'GITHUB_BOT_USERNAME is required'),
  githubRepoAllowlist: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])),

  // OpenCode
  opencodeBaseUrl: z.string().url().default('http://localhost:4242'),
  opencodeApiKey: z.string().optional(),
  opencodeModel: z.string().default('anthropic/claude-sonnet-4-6'),

  // Polling cron expressions
  pollCronAssignments: z.string().default('*/2 * * * *'),
  pollCronMentions: z.string().default('*/2 * * * *'),
  pollCronCi: z.string().default('*/3 * * * *'),
  pollCronStale: z.string().default('*/20 * * * *'),

  // Worker
  maxConcurrentWorkers: z.coerce.number().int().positive().default(3),
  maxRetryAttempts: z.coerce.number().int().positive().default(3),
  staleThresholdMinutes: z.coerce.number().int().positive().default(60),

  // Persistence
  databasePath: z.string().default('./data/ticketforge.db'),

  // API
  apiPort: z.coerce.number().int().positive().default(3000),
  apiHost: z.string().default('127.0.0.1'),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  logPretty: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof ConfigSchema>;

// ─── Load & validate ──────────────────────────────────────────────────────────

function loadConfig(): Config {
  const raw = {
    githubToken: process.env['GITHUB_TOKEN'],
    githubBotUsername: process.env['GITHUB_BOT_USERNAME'],
    githubRepoAllowlist: process.env['GITHUB_REPO_ALLOWLIST'],
    opencodeBaseUrl: process.env['OPENCODE_BASE_URL'],
    opencodeApiKey: process.env['OPENCODE_API_KEY'],
    opencodeModel: process.env['OPENCODE_MODEL'],
    pollCronAssignments: process.env['POLL_CRON_ASSIGNMENTS'],
    pollCronMentions: process.env['POLL_CRON_MENTIONS'],
    pollCronCi: process.env['POLL_CRON_CI'],
    pollCronStale: process.env['POLL_CRON_STALE'],
    maxConcurrentWorkers: process.env['MAX_CONCURRENT_WORKERS'],
    maxRetryAttempts: process.env['MAX_RETRY_ATTEMPTS'],
    staleThresholdMinutes: process.env['STALE_THRESHOLD_MINUTES'],
    databasePath: process.env['DATABASE_PATH'],
    apiPort: process.env['API_PORT'],
    apiHost: process.env['API_HOST'],
    logLevel: process.env['LOG_LEVEL'],
    logPretty: process.env['LOG_PRETTY'],
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const msgs = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Configuration validation failed:\n${msgs}`);
  }

  return result.data;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) _config = loadConfig();
  return _config;
}

// Reset for testing
export function _resetConfig(): void {
  _config = null;
}
