#!/bin/sh
set -eu

# For containerized runs where OpenCode is hosted outside the container,
# allow OPENCODE_EXTERNAL_URL to be used as a fallback.
if [ -n "${OPENCODE_EXTERNAL_URL:-}" ] && [ -z "${OPENCODE_BASE_URL:-}" ]; then
  export OPENCODE_BASE_URL="$OPENCODE_EXTERNAL_URL"
fi

exec "$@"
