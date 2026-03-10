# AGENTS.md

This document describes how TicketForge works as an autonomous agent system.

## Overview

TicketForge is an autonomous GitHub bot. It polls for assigned issues and
`@mentions`, dispatches work to an [OpenCode](https://opencode.ai) AI agent,
and posts results back to GitHub. It runs as a Docker container with no manual
intervention required after deployment.

## How it works

```
GitHub issue assigned to bot
        │
        ▼
  Assignment poller (every 2 min)
        │
        ▼
  Work item created (status: new → queued)
        │
        ▼
  Worker picks up item (status: running)
        │
        ▼
  Build prompt from issue context
        │
        ▼
  Send prompt to OpenCode daemon
  (opencode serve on port 4242)
        │
        ▼
  OpenCode agent implements changes,
  creates branch, opens PR
        │
        ▼
  Parse structured JSON result
        │
        ├─ needs_ci=true  → status: waiting_for_ci
        │                    CI watcher polls until checks pass
        │
        ├─ needs_human=true → status: waiting_for_human
        │                      Wait for human to respond
        │
        ├─ completed → post summary comment, close work item
        │
        └─ failed/blocked → post error comment, mark failed
```

## Triggering the bot

1. **Assign an issue** to the bot's GitHub account (configured via `GITHUB_BOT_USERNAME`)
2. **Mention the bot** in any issue or PR comment: `@mergecube please fix this`

The bot only acts on repositories listed in `GITHUB_REPO_ALLOWLIST`.

## What the agent does

When the bot picks up a work item, it sends a structured prompt to OpenCode containing:

- The repository path and name
- The issue/PR title, body, and URL
- Branch naming rules (`bot/<id>-<description>`)
- Instructions to implement changes, create a branch, and open a PR
- A required JSON response format for machine-readable results

The agent is expected to return:

```json
{
  "summary": "What was done",
  "action_taken": "implemented | commented | opened_pr | blocked | failed",
  "branch_name": "bot/abc123-fix-bug",
  "pr_number": 42,
  "needs_human": false,
  "needs_ci": true,
  "next_step": "Wait for CI"
}
```

If CI fails on a PR the agent created, the CI watcher detects it and sends the
agent back in with a fix prompt targeting the same branch.

## Authentication

The container handles OpenAI OAuth automatically. On first boot (or when the
token expires), it runs a device-code login flow:

1. Requests a one-time code from OpenAI
2. Creates a GitHub issue titled "Action required: OpenAI login needed" with
   the verification URL and code
3. Polls until someone completes the browser login
4. Saves the token and closes the auth issue
5. Proceeds to start the agent

If auth fails mid-task, the worker detects the error and triggers the same flow,
posting the login link as a comment on the issue it was working on.

## Work item lifecycle

| Status | Meaning |
|--------|---------|
| `new` | Just discovered by a poller |
| `queued` | Waiting for a worker slot |
| `running` | OpenCode agent is actively working |
| `waiting_for_ci` | PR opened, waiting for checks to pass |
| `waiting_for_human` | Agent needs clarification |
| `completed` | Done |
| `failed` | Exhausted retries or unrecoverable error |
| `cancelled` | Manually cancelled |

Transitions are enforced by a state machine (`src/domain/state-machine.ts`).
Failed items are retried up to `MAX_RETRY_ATTEMPTS` (default: 3). Items stuck
longer than `STALE_THRESHOLD_MINUTES` (default: 60) are cleaned up by the stale
reconciler.

## Polling jobs

| Job | Default interval | What it does |
|-----|-----------------|--------------|
| Assignment poller | Every 2 min | Finds issues assigned to the bot |
| Mention poller | Every 2 min | Finds `@bot` mentions in comments |
| CI watcher | Every 3 min | Checks if CI passed/failed on bot PRs |
| Stale reconciler | Every 20 min | Retries or fails stuck work items |

## Running with Docker

```bash
docker run \
  -e GITHUB_TOKEN=ghp_... \
  -e GITHUB_BOT_USERNAME=mergecube \
  -e GITHUB_REPOSITORY=owner/repo \
  -e OPENCODE_MODEL=openai/gpt-5.3-codex \
  ghcr.io/florianwenzel/ticketforge:latest
```

On first run, the container will:

1. Clone the target repository
2. Install dependencies
3. Prompt for OpenAI auth (creates a GitHub issue with the login link)
4. Start the OpenCode daemon
5. Start TicketForge and begin polling

## REST API

The bot exposes an API on port 3000 for monitoring:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Liveness check |
| `GET /api/metrics` | Queue and work item counts |
| `GET /api/work-items` | List work items (filter by `?status=`, `?repo=`) |
| `GET /api/work-items/:id` | Single work item detail |
| `GET /api/work-items/:id/audit` | Audit trail for a work item |
| `GET /api/audit-events` | All audit events (filter by `?kind=`) |
| `GET /api/sessions` | OpenCode session list |
| `GET /api/checkpoints` | Work item checkpoints |
