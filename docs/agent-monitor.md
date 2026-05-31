# Agent Monitor

The Agent Monitor is local-first. The Next.js UI reads each coding agent's local
session state and renders both **Codex** and **Claude Code** sessions in a single
panel, with a `source` badge per session. No cloud database is involved.

- Codex sessions come from Codex Desktop's local SQLite state in `~/.codex`
  through `/api/codex-local`.
- Claude Code sessions come from the JSONL transcripts in
  `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` through `/api/claude-local`.

Both routes return the same `{ available, threadId, sessions, events }` shape,
so the monitor merges the two streams and sorts sessions by last activity.

## Watch Current Work

Start the local app:

```bash
npm run dev
```

Open the app and look at the Agent Monitor panel. Sessions from both agents are
listed together (most recently active first). Selecting a session streams its
events — tool calls, command results, token/turn updates, messages, and
discovered subagents — refreshed every two seconds.

## Claude Code Sessions

Claude Code writes a per-project transcript as JSONL. The directory name is the
working directory with every non-alphanumeric character replaced by `-`
(e.g. `/Users/me/git/ai-office` → `-Users-me-git-ai-office`). Each file is one
session. The route maps transcript blocks to monitor events:

- `tool_use` → `tool` events (`Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`,
  `WebFetch`, ... mapped to tool-rack stations: SHELL / EDIT / READ / SEARCH /
  WEB / PLAN). `Task` is surfaced as a `subagent` event.
- `tool_result` → `status` or `error` events, matched back to the originating
  tool by `tool_use_id`.
- assistant `text` and `thinking` blocks, and string `user` prompts → `message`
  events.
- `ai-title` provides the session name; `cwd`, `gitBranch`, and `model` populate
  the session header.

API keys (`sk-...`) and email addresses are redacted before events leave the
route. Override the search location with `CLAUDE_HOME`, or pin a specific
session with the `CLAUDE_THREAD_ID` environment variable / `?threadId=` query
parameter.

## Codex Sessions

The Codex side is unchanged: `/api/codex-local` reads `~/.codex/state_5.sqlite`
(threads) and `~/.codex/logs_2.sqlite` (logs) and classifies tool calls, command
approvals/results, token usage, and discovered subagent threads. It does not
expose hidden reasoning.

The optional collector script (`scripts/codex-monitor.mjs`) is still useful for
local classification smoke tests:

```bash
printf '{"type":"subagent_message","subagent":"reviewer","message":"check tests"}\n' \
  | node scripts/codex-monitor.mjs classify
```

## AI Office World

The AI Office world is also local. Map data, character definitions, movement,
and demo conversation state are generated in the browser by
`src/lib/localWorld.ts`.
