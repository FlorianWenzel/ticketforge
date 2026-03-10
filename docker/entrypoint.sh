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
npm ci

# ── 3. OpenAI device auth (if not already authenticated) ────────────────────
AUTH_FILE="${HOME}/.local/share/opencode/auth.json"

ensure_openai_auth() {
  # Check if we already have a token
  if [ -f "$AUTH_FILE" ] && grep -q '"openai"' "$AUTH_FILE" 2>/dev/null; then
    echo "OpenAI auth already present"
    return 0
  fi

  echo "No OpenAI auth found — starting device login flow..."

  # Run the device auth tool in the background, capture output
  AUTH_LOG=$(mktemp)
  opencode-openai-device-auth > "$AUTH_LOG" 2>&1 &
  AUTH_PID=$!

  # Wait for the user code to appear in output
  USER_CODE=""
  for i in $(seq 1 30); do
    sleep 1
    if grep -qP '[A-Z0-9]{4}-[A-Z0-9]{5}' "$AUTH_LOG" 2>/dev/null; then
      USER_CODE=$(grep -oP '[A-Z0-9]{4}-[A-Z0-9]{5}' "$AUTH_LOG" | head -1)
      break
    fi
  done

  if [ -z "$USER_CODE" ]; then
    echo "ERROR: Could not extract device code"
    cat "$AUTH_LOG"
    kill $AUTH_PID 2>/dev/null || true
    rm -f "$AUTH_LOG"
    return 1
  fi

  VERIFY_URL="https://auth.openai.com/codex/device"

  echo ""
  echo "=========================================="
  echo "  OpenAI authentication required"
  echo "  1. Open:  ${VERIFY_URL}"
  echo "  2. Enter: ${USER_CODE}"
  echo "  (expires in 15 minutes)"
  echo "=========================================="
  echo ""

  # Post the login link as a GitHub issue
  ISSUE_BODY="$(cat <<EOF
## OpenAI Authentication Required

TicketForge needs someone to complete the OpenAI login:

1. Open: ${VERIFY_URL}
2. Enter code: **\`${USER_CODE}\`**
3. Complete the login (code expires in 15 minutes)

_The container will resume automatically once authenticated._
EOF
)"

  gh label create "auth" --repo "$GITHUB_REPOSITORY" --description "Authentication required" --color "D93F0B" 2>/dev/null || true
  gh issue create \
    --repo "$GITHUB_REPOSITORY" \
    --title "Action required: OpenAI login needed" \
    --label "auth" \
    --body "$ISSUE_BODY"

  # Wait for the auth tool to complete
  echo "Waiting for auth to complete..."
  if wait $AUTH_PID; then
    echo "Auth successful!"
    cat "$AUTH_LOG"

    # Close the auth issue
    gh issue list --repo "$GITHUB_REPOSITORY" --label "auth" --state open --json number --jq '.[0].number' | \
      xargs -I{} gh issue close {} --repo "$GITHUB_REPOSITORY" --comment "Authentication completed successfully." 2>/dev/null || true
  else
    echo "ERROR: Auth failed"
    cat "$AUTH_LOG"
    rm -f "$AUTH_LOG"
    return 1
  fi

  rm -f "$AUTH_LOG"
  return 0
}

ensure_openai_auth

# ── 4. Start OpenCode daemon ────────────────────────────────────────────────
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

# ── 5. Start TicketForge ────────────────────────────────────────────────────
echo "Starting TicketForge..."
exec npx tsx src/index.ts
