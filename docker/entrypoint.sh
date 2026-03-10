#!/usr/bin/env bash
set -euo pipefail

# ── Validate required env vars ───────────────────────────────────────────────
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_BOT_USERNAME:?GITHUB_BOT_USERNAME is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

# Default the allowlist to the target repo if not set
export GITHUB_REPO_ALLOWLIST="${GITHUB_REPO_ALLOWLIST:-$GITHUB_REPOSITORY}"

# ── 1. Configure git to use the token for HTTPS cloning ─────────────────────
git config --global url."https://${GITHUB_BOT_USERNAME}:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

echo "Git credentials configured for ${GITHUB_BOT_USERNAME}"

# ── 2. Clone the repository ─────────────────────────────────────────────────
WORKSPACE="/workspace"
if [ ! -d "$WORKSPACE/.git" ]; then
  gh repo clone "$GITHUB_REPOSITORY" "$WORKSPACE"
fi
cd "$WORKSPACE"

# ── 3. Start OpenCode daemon ────────────────────────────────────────────────
OPENCODE_PORT="${OPENCODE_PORT:-4242}"
export OPENCODE_BASE_URL="http://localhost:${OPENCODE_PORT}"

echo "Starting opencode serve on port ${OPENCODE_PORT}..."
opencode serve --port "$OPENCODE_PORT" &
OPENCODE_PID=$!

# Wait for opencode to be ready
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${OPENCODE_PORT}/health" >/dev/null 2>&1; then
    echo "OpenCode is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "WARNING: OpenCode did not become ready in 30s, continuing anyway..."
  fi
  sleep 1
done

# ── 4. Start TicketForge ────────────────────────────────────────────────────
echo "Starting TicketForge..."
exec npx tsx src/index.ts
