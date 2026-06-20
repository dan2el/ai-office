import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cursor stores agent transcripts as JSONL under
// ~/.cursor/projects/<project-slug>/agent-transcripts/<sessionId>/<sessionId>.jsonl
const cursorHome = process.env.CURSOR_HOME || path.join(os.homedir(), '.cursor');
const projectsDir = path.join(cursorHome, 'projects');
const sessionIdPattern = /^[A-Za-z0-9-]+$/;
const maxSessions = 16;
const maxEvents = 120;
const handoffEventLimit = 1500;

type ContentBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};

type TranscriptLine = {
  role?: string;
  message?: {
    content?: ContentBlock[];
  };
};

type MonitorEvent = {
  id: string;
  ts: number;
  kind: string;
  source: string;
  agentName?: string | null;
  channel?: string | null;
  text?: string | null;
  data?: unknown;
};

function safeText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
}

function clip(value: string, max = 2000) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function oneLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function parseLines(raw: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed) as TranscriptLine);
    } catch {
      // Skip malformed lines.
    }
  }
  return lines;
}

function toolSummary(name: string, input: Record<string, unknown> | undefined) {
  if (!input) return name;
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined);
  switch (name) {
    case 'Shell': {
      const desc = str('description');
      const cmd = str('command') ?? '';
      return desc ? `${desc}: ${cmd}` : cmd;
    }
    case 'Read':
    case 'Write':
    case 'StrReplace':
    case 'Delete':
    case 'EditNotebook':
      return `${name} ${str('path') ?? str('file_path') ?? ''}`.trim();
    case 'Grep':
      return `grep ${str('pattern') ?? ''}${str('path') ? ` in ${str('path')}` : ''}`.trim();
    case 'Glob':
      return `glob ${str('glob_pattern') ?? str('pattern') ?? ''}`.trim();
    case 'Task':
      return `${str('subagent_type') ? `[${str('subagent_type')}] ` : ''}${
        str('description') ?? str('prompt') ?? ''
      }`.trim();
    case 'CallMcpTool':
      return `${str('server') ?? 'mcp'} ${str('toolName') ?? ''}`.trim();
    case 'WebSearch':
    case 'WebFetch':
      return `${name} ${str('search_term') ?? str('url') ?? ''}`.trim();
    default:
      return `${name} ${oneLine(JSON.stringify(input)).slice(0, 120)}`.trim();
  }
}

function extractUserQuery(text: string) {
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (match) return oneLine(match[1]);
  return oneLine(text.replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, ''));
}

function cwdFromProjectSlug(projectSlug: string) {
  if (!projectSlug || projectSlug.startsWith('.')) return '';
  if (projectSlug.startsWith('var-folders-')) return '';
  const parts = projectSlug.split('-').filter(Boolean);
  if (parts[0] === 'Users' && parts.length >= 2) {
    return `/${['Users', ...parts.slice(1)].join('/')}`;
  }
  return `/${parts.join('/')}`;
}

function cwdFromLines(lines: TranscriptLine[], projectSlug: string) {
  const paths: string[] = [];
  for (const line of lines) {
    const blocks = line.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type !== 'tool_use' || !block.input) continue;
      const input = block.input;
      const working =
        typeof input.working_directory === 'string' ? input.working_directory : undefined;
      const filePath =
        typeof input.path === 'string'
          ? input.path
          : typeof input.file_path === 'string'
            ? input.file_path
            : undefined;
      if (working) paths.push(working);
      if (filePath?.startsWith('/')) {
        const parent = path.dirname(filePath);
        if (parent && parent !== '/') paths.push(parent);
      }
    }
  }
  if (paths.length) {
    const counts = new Map<string, number>();
    for (const value of paths) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return cwdFromProjectSlug(projectSlug);
}

function isCharacterEvent(event: MonitorEvent) {
  const text = event.text ?? '';
  if (!text.trim()) return false;
  if (['message', 'error', 'subagent', 'status'].includes(event.kind)) return true;
  if (event.kind !== 'tool') return false;
  if (event.channel === 'TodoWrite') return false;
  return true;
}

function recentCharacterEvents(events: MonitorEvent[]) {
  const useful = events.filter(isCharacterEvent);
  const chosen = useful.length ? useful : events.filter((event) => event.text?.trim());
  return chosen.slice(-24).map((event) => ({
    id: event.id,
    ts: event.ts,
    kind: event.kind,
    channel: event.channel ?? null,
    text: event.text ?? null,
    source: event.source,
  }));
}

function eventsFromLines(
  lines: TranscriptLine[],
  sessionId: string,
  eventLimit = maxEvents,
): MonitorEvent[] {
  const events: MonitorEvent[] = [];
  let seq = 0;
  const push = (event: Omit<MonitorEvent, 'id'>) => {
    events.push({ id: `cursor-${sessionId}-${seq}`, ...event });
    seq += 1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const stamp = Date.now() - (lines.length - index) * 1000;
    const content = line.message?.content;
    if (!Array.isArray(content)) continue;

    if (line.role === 'user') {
      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          const query = extractUserQuery(block.text);
          if (query) {
            push({
              ts: stamp,
              kind: 'message',
              source: 'user',
              agentName: 'You',
              channel: 'prompt',
              text: clip(safeText(query)),
            });
          }
        }
      }
    } else if (line.role === 'assistant') {
      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          push({
            ts: stamp,
            kind: 'message',
            source: 'assistant',
            agentName: 'Cursor',
            channel: 'message',
            text: clip(safeText(block.text)),
          });
        } else if (block.type === 'tool_use' && block.name) {
          const isSub = block.name === 'Task';
          push({
            ts: stamp,
            kind: isSub ? 'subagent' : 'tool',
            source: isSub ? 'subagent' : 'tool',
            agentName: 'Cursor',
            channel: block.name,
            text: clip(safeText(toolSummary(block.name, block.input))),
          });
        }
      }
    }
  }
  return events.slice(-eventLimit);
}

function sessionFromLines(
  sessionKey: string,
  sessionId: string,
  lines: TranscriptLine[],
  mtimeMs: number,
  projectSlug: string,
) {
  const cwd = cwdFromLines(lines, projectSlug);
  const firstUser = lines.find((line) => line.role === 'user');
  const firstPrompt = firstUser?.message?.content
    ?.find((block) => block.type === 'text' && block.text?.trim())
    ?.text;
  const title = firstPrompt ? extractUserQuery(firstPrompt).slice(0, 72) : undefined;
  const updatedAt = mtimeMs;
  const startedAt = mtimeMs;
  const status = Date.now() - updatedAt < 120_000 ? 'running' : 'idle';
  const recentEvents = recentCharacterEvents(eventsFromLines(lines, sessionId));

  return {
    id: sessionKey,
    source: 'local' as const,
    recentEvents,
    name: title || sessionId,
    cwd,
    command: ['Cursor Agent'],
    status,
    startedAt,
    updatedAt,
    branch: null,
    gitHead: null,
    host: os.hostname(),
    model: 'cursor-agent',
    reasoningEffort: null,
    agentName: 'Cursor',
    agentRole: null,
    parentThreadId: null,
  };
}

async function listTranscripts() {
  let projects: string[];
  try {
    projects = await fs.readdir(projectsDir);
  } catch {
    return [];
  }

  const transcripts: {
    id: string;
    sessionId: string;
    filePath: string;
    mtimeMs: number;
    projectSlug: string;
  }[] = [];

  await Promise.all(
    projects.map(async (project) => {
      if (project.startsWith('.')) return;
      const transcriptsDir = path.join(projectsDir, project, 'agent-transcripts');
      let sessionDirs: string[];
      try {
        sessionDirs = await fs.readdir(transcriptsDir);
      } catch {
        return;
      }
      await Promise.all(
        sessionDirs.map(async (sessionId) => {
          if (!sessionIdPattern.test(sessionId)) return;
          const filePath = path.join(transcriptsDir, sessionId, `${sessionId}.jsonl`);
          try {
            const stat = await fs.stat(filePath);
            transcripts.push({
              id: `${project}:${sessionId}`,
              sessionId,
              filePath,
              mtimeMs: stat.mtimeMs,
              projectSlug: project,
            });
          } catch {
            // Skip unreadable transcripts.
          }
        }),
      );
    }),
  );

  transcripts.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return transcripts;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const eventLimit = url.searchParams.get('full') === '1' ? handoffEventLimit : maxEvents;
    const transcripts = await listTranscripts();
    const sessions = (
      await Promise.all(
        transcripts.slice(0, maxSessions).map(async ({ id, sessionId, filePath, mtimeMs, projectSlug }) => {
          const raw = await fs.readFile(filePath, 'utf8');
          return sessionFromLines(id, sessionId, parseLines(raw), mtimeMs, projectSlug);
        }),
      )
    ).sort((a, b) => b.updatedAt - a.updatedAt);

    const requested = url.searchParams.get('threadId') || process.env.CURSOR_THREAD_ID;
    const requestedTarget = requested
      ? transcripts.find((item) => item.id === requested) ??
        transcripts.find((item) => item.sessionId === requested)
      : undefined;
    const threadId = requestedTarget?.id ?? sessions[0]?.id;
    const target = threadId ? transcripts.find((item) => item.id === threadId) : undefined;
    const events = target
      ? eventsFromLines(parseLines(await fs.readFile(target.filePath, 'utf8')), target.id, eventLimit)
      : [];

    return NextResponse.json({
      available: true,
      threadId,
      sessions,
      events,
      eventLimit,
      updatedAt: Date.now(),
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      error: error instanceof Error ? error.message : 'Unable to read local Cursor logs',
      sessions: [],
      events: [],
      updatedAt: Date.now(),
    });
  }
}
