import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const stateDb = path.join(codexHome, 'state_5.sqlite');
const logsDb = path.join(codexHome, 'logs_2.sqlite');
const threadIdPattern = /^[A-Za-z0-9-]+$/;

type SqlValue = string | number | null;

type ThreadRow = {
  id: string;
  title: string;
  cwd: string;
  source: string;
  model: string | null;
  reasoning_effort: string | null;
  updated_at_ms: number;
  created_at_ms: number;
  git_branch: string | null;
  git_sha: string | null;
  agent_nickname: string | null;
  agent_role: string | null;
};

type LogRow = {
  id: number;
  ts: number;
  ts_nanos: number;
  level: string;
  target: string;
  body: string | null;
};

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function sqliteJson<T>(dbPath: string, sql: string, values: SqlValue[] = []): Promise<T[]> {
  await fs.access(dbPath);
  let valueIndex = 0;
  const statement = sql.replaceAll('?', () => {
    const value = values[valueIndex++];
    if (value === null) return 'null';
    return typeof value === 'number' ? String(value) : sqlString(value);
  });
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, statement], {
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

function safeText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/user\.account_id="[^"]+"/g, 'user.account_id="[redacted]"');
}

function parseSource(source: string) {
  try {
    const parsed = JSON.parse(source);
    return parsed?.subagent?.thread_spawn;
  } catch {
    return null;
  }
}

function sessionFromThread(thread: ThreadRow) {
  const subagent = parseSource(thread.source);
  const updatedAt = thread.updated_at_ms || 0;
  const status = Date.now() - updatedAt < 90_000 ? 'running' : 'idle';

  return {
    id: thread.id,
    source: 'local',
    name: thread.agent_nickname
      ? `${thread.agent_nickname}: ${thread.title}`
      : thread.title || thread.id,
    cwd: thread.cwd,
    command: ['Codex Desktop'],
    status,
    startedAt: thread.created_at_ms,
    updatedAt,
    branch: thread.git_branch,
    gitHead: thread.git_sha,
    host: os.hostname(),
    model: thread.model,
    reasoningEffort: thread.reasoning_effort,
    agentName: thread.agent_nickname,
    agentRole: thread.agent_role,
    parentThreadId: subagent?.parent_thread_id,
  };
}

function extractJsonAfter(prefix: string, body: string) {
  const index = body.indexOf(prefix);
  if (index === -1) return null;
  const start = body.indexOf('{', index + prefix.length);
  if (start === -1) return null;
  const endMarker = body.indexOf(' thread_id=', start);
  const raw = body.slice(start, endMarker === -1 ? undefined : endMarker);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function attr(body: string, name: string) {
  return body.match(new RegExp(`${name}=("[^"]*"|[^\\s}]+)`))?.[1]?.replace(/^"|"$/g, '');
}

function classifyLog(row: LogRow) {
  const body = row.body || '';
  const ts = row.ts * 1000 + Math.floor(row.ts_nanos / 1_000_000);

  const toolCall = body.match(/ToolCall: ([A-Za-z0-9_:.:-]+)/);
  if (toolCall) {
    const toolName = toolCall[1];
    const args = extractJsonAfter(`ToolCall: ${toolName}`, body);
    const command = typeof args?.cmd === 'string' ? args.cmd : JSON.stringify(args || {});
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: 'tool',
      source: 'tool',
      agentName: 'Codex Desktop',
      channel: toolName,
      text: safeText(`${toolName}: ${command}`),
      data: { toolName, rowId: row.id },
    };
  }

  if (body.includes('event.name="codex.tool_result"')) {
    const toolName = attr(body, 'tool_name') || 'tool';
    const success = attr(body, 'success') || 'unknown';
    const duration = attr(body, 'duration_ms');
    const outputLines = attr(body, 'output_line_count');
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: success === 'true' ? 'status' : 'error',
      source: 'tool',
      agentName: 'Codex Desktop',
      channel: toolName,
      text: `${toolName} finished: success=${success}${
        duration ? `, ${duration}ms` : ''
      }${outputLines ? `, ${outputLines} output lines` : ''}`,
      data: { toolName, success, rowId: row.id },
    };
  }

  if (body.includes('event.name="codex.tool_decision"')) {
    const toolName = attr(body, 'tool_name') || 'tool';
    const decision = attr(body, 'decision') || 'unknown';
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: 'status',
      source: 'collector',
      agentName: 'Codex Desktop',
      channel: toolName,
      text: `${toolName} decision: ${decision}`,
      data: { toolName, decision, rowId: row.id },
    };
  }

  if (body.includes('Output item item=FunctionCall')) {
    const toolName = body.match(/name: "([^"]+)"/)?.[1] || 'tool';
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: 'tool',
      source: 'tool',
      agentName: 'Codex Desktop',
      channel: toolName,
      text: `${toolName} call started`,
      data: { toolName, rowId: row.id },
    };
  }

  if (body.includes('post sampling token usage')) {
    const total = attr(body, 'total_usage_tokens');
    const needsFollowUp = attr(body, 'needs_follow_up');
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: 'status',
      source: 'codex',
      agentName: 'Codex Desktop',
      channel: 'turn',
      text: `turn usage: ${total || 'unknown'} tokens${
        needsFollowUp ? `, needs_follow_up=${needsFollowUp}` : ''
      }`,
      data: { total, needsFollowUp, rowId: row.id },
    };
  }

  if (row.level === 'WARN' || row.level === 'ERROR') {
    return {
      id: `local-log-${row.id}`,
      ts,
      kind: row.level === 'ERROR' ? 'error' : 'status',
      source: 'codex',
      agentName: 'Codex Desktop',
      channel: row.target,
      text: safeText(body.split(': ').slice(-1)[0] || row.target),
      data: { level: row.level, rowId: row.id },
    };
  }

  return null;
}

async function readSessions() {
  const threads = await sqliteJson<ThreadRow>(
    stateDb,
    `select id, title, cwd, source, model, reasoning_effort, updated_at_ms,
            created_at_ms, git_branch, git_sha, agent_nickname, agent_role
       from threads
      order by updated_at_ms desc
      limit 12`,
  );
  return Promise.all(
    threads.map(async (thread) => {
      const session = sessionFromThread(thread);
      // Attach a few recent events so each session can drive its office character.
      const events = await readEvents(thread.id).catch(() => []);
      return {
        ...session,
        recentEvents: events.slice(-6).map((event) => ({
          ts: event.ts,
          kind: event.kind,
          channel: event.channel,
          text: event.text,
          source: event.source,
        })),
      };
    }),
  );
}

async function readEvents(threadId: string) {
  if (!threadIdPattern.test(threadId)) return [];
  const rows = await sqliteJson<LogRow>(
    logsDb,
    `select id, ts, ts_nanos, level, target, feedback_log_body as body
       from logs
      where thread_id = ?
        and (
          target = 'codex_core::stream_events_utils'
          or target = 'codex_core::session::turn'
          or feedback_log_body like '%event.name="codex.tool_result"%'
          or feedback_log_body like '%event.name="codex.tool_decision"%'
        )
      order by ts desc, ts_nanos desc, id desc
      limit 260`,
    [threadId],
  );

  const seen = new Set<string>();
  return rows
    .map(classifyLog)
    .filter((event): event is NonNullable<ReturnType<typeof classifyLog>> => {
      if (!event) return false;
      const key = `${event.ts}:${event.kind}:${event.channel}:${event.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 120)
    .reverse();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessions = await readSessions();
    const requestedThreadId = url.searchParams.get('threadId') || process.env.CODEX_THREAD_ID;
    const threadId =
      requestedThreadId && threadIdPattern.test(requestedThreadId)
        ? requestedThreadId
        : sessions.find((session) => session.cwd === process.cwd())?.id || sessions[0]?.id;
    const events = threadId ? await readEvents(threadId) : [];

    return NextResponse.json({
      available: true,
      threadId,
      sessions,
      events,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      error: error instanceof Error ? error.message : 'Unable to read local Codex logs',
      sessions: [],
      events: [],
      updatedAt: Date.now(),
    });
  }
}
