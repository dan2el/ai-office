#!/usr/bin/env bash
# Ensure the AI Office monitor (Next.js dev server) is running in the background.
# Safe to call repeatedly: if the port already responds, it does nothing.
# Used by the Claude Code SessionStart hook and the codex shell wrapper so the
# monitor comes up automatically whenever you start Claude or Codex.

PORT="${AI_OFFICE_PORT:-3000}"
DIR="${AI_OFFICE_DIR:-/Users/work/git/ai-office}"
LOG="/tmp/ai-office-monitor.log"

# Only keep the monitor up while Claude or Codex is actually open.
if ! pgrep -f '/Applications/Claude.app' >/dev/null 2>&1 \
   && ! pgrep -f '/Applications/Codex.app' >/dev/null 2>&1; then
  exit 0
fi

# Already up? Nothing to do.
if curl -sf "http://localhost:${PORT}" -o /dev/null 2>/dev/null; then
  exit 0
fi

cd "$DIR" 2>/dev/null || exit 0

# Detached background start so the calling shell/hook returns immediately.
nohup npm run dev:frontend -- -p "$PORT" >"$LOG" 2>&1 &
disown 2>/dev/null || true

exit 0
