# TicketForge

A production-ready Node.js/TypeScript service that acts as a GitHub automation
wrapper around [OpenCode](https://opencode.ai). Runs as a long-lived process on
a VM and periodically polls GitHub for work.

## Architecture

```
ticketforge/
├── src/
│   ├── index.ts              # Entry point & boot sequence
│   ├── config/               # Zod-validated env config
│   ├── domain/               # Types, state machine
│   ├── github/               # Octokit adapter (issues, comments, PRs, checks)
│   ├── opencode/             # OpenCode HTTP client + session manager
│   ├── queue/                # Per-key concurrency queue
│   ├── worker/               # Work-item executor
│   ├── scheduler/            # node-cron jobs
│   │   └── jobs/
│   │       ├── assignment-poller.ts
│   │       ├── mention-poller.ts
│   │       ├── ci-watcher.ts
│   │       └── stale-reconciler.ts
│   ├── store/                # Kysely + SQLite persistence
│   └── api/                  # Express health/metrics endpoints
├── Kysely/
│   ├── migrations/           # Versioned SQL migrations
│   └── migrator.ts
├── scripts/
│   ├── migrate.ts
│   └── seed.ts
└── test/
```

## Scheduled jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| Assignment poller | `POLL_CRON_ASSIGNMENTS` (default: `*/2 * * * *`) | Detect issues assigned to the bot |
| Mention poller | `POLL_CRON_MENTIONS` (default: `*/2 * * * *`) | Detect `@bot` mentions in comments |
| CI watcher | `POLL_CRON_CI` (default: `*/3 * * * *`) | Resume work after CI completes |
| Stale reconciler | `POLL_CRON_STALE` (default: `*/20 * * * *`) | Retry stuck jobs, fail past threshold |

## Work item state machine

```
new → queued → running → waiting_for_ci → running → completed
                       ↘ waiting_for_human → running
                       ↘ failed
                       ↘ cancelled
```

## Prerequisites

- **Node 24+** (via nvm: `nvm use 24`)
- **OpenCode daemon** running and reachable (default `http://localhost:4242`)
- A **GitHub bot account** with a token scoped to `repo`, `read:org`, `workflow`

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env — set GITHUB_TOKEN, GITHUB_BOT_USERNAME, GITHUB_REPO_ALLOWLIST,
# OPENCODE_BASE_URL, etc.

# 3. Run migrations
npm run migrate

# 4. Start the service
npm start

# Development (watch mode)
npm run dev
```

## API endpoints

All endpoints are under `/api`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Liveness check + DB ping |
| `GET /api/ready` | Readiness check |
| `GET /api/metrics` | Queue stats + work-item counts by status |
| `GET /api/work-items/:id` | Work item detail |
| `GET /api/work-items/:id/audit` | Audit trail for a work item |

## OpenCode integration

TicketForge uses **Pattern B** (external daemon): OpenCode is started separately
and TicketForge connects over HTTP.

```bash
# Start OpenCode on the same VM
opencode serve --port 4242
```

Then set `OPENCODE_BASE_URL=http://localhost:4242` in `.env`.

Each task sends a structured prompt and expects a JSON result block:

```json
{
  "summary": "Implemented the requested feature",
  "action_taken": "opened_pr",
  "branch_name": "bot/abc123-add-feature",
  "pr_number": 42,
  "needs_human": false,
  "needs_ci": true,
  "next_step": "Wait for CI checks"
}
```

## Environment variables

See [`.env.example`](.env.example) for the full list with documentation.

## Running tests

```bash
# Unit + integration tests (Node built-in test runner)
node --import tsx/esm --test test/**/*.test.ts
```

## Production deployment

1. Set `LOG_PRETTY=false` for JSON logs (pipe through `pino-pretty` in dev only).
2. Set `DATABASE_PATH` to a persistent volume path (e.g. `/data/ticketforge.db`).
3. Use a process supervisor (systemd, PM2, Docker) to restart on crash.
4. Mount the repo workspace at `WORKSPACE_ROOT` (default `/workspace`).

Example systemd unit:

```ini
[Unit]
Description=TicketForge
After=network.target

[Service]
WorkingDirectory=/opt/ticketforge
EnvironmentFile=/opt/ticketforge/.env
ExecStart=/usr/bin/node --import tsx/esm src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
