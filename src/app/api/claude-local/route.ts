import fs from 'node:fs/promises';
import { Dirent } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Claude Code keeps per-project transcripts as JSONL under
// ~/.claude/projects/<cwd-slug>/<sessionId>.jsonl. This route is the Claude
// counterpart of /api/codex-local: it reads those local transcripts and shapes
// them into the same session/event contract the monitor already consumes.
const claudeHome = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
const projectsDir = path.join(claudeHome, 'projects');
const sessionIdPattern = /^[A-Za-z0-9-]+$/;
const maxSessions = 16;
const maxEvents = 120;
const handoffEventLimit = 1500;

type ContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

type TranscriptLine = {
  type?: string;
  uuid?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  customTitle?: string;
  aiTitle?: string;
  lastPrompt?: string;
  slug?: string;
  isSidechain?: boolean;
  message?: {
    role?: string;
    model?: string;
    content?: string | ContentBlock[];
  };
};

type LimitState = {
  kind: 'usage_limit' | 'rate_limit' | 'context_limit' | 'suspected';
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  detectedAt: number;
  resetsAt?: number | null;
  resetText?: string | null;
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

function tsOf(line: TranscriptLine) {
  return line.timestamp ? Date.parse(line.timestamp) : NaN;
}

function toolSummary(name: string, input: Record<string, unknown> | undefined) {
  if (!input) return name;
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined);
  switch (name) {
    case 'Bash': {
      const desc = str('description');
      const cmd = str('command') ?? '';
      return desc ? `${desc}: ${cmd}` : cmd;
    }
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return `${name} ${str('file_path') ?? ''}`.trim();
    case 'Grep':
      return `grep ${str('pattern') ?? ''}${str('path') ? ` in ${str('path')}` : ''}`.trim();
    case 'Glob':
      return `glob ${str('pattern') ?? ''}`.trim();
    case 'Task':
      return `${str('subagent_type') ? `[${str('subagent_type')}] ` : ''}${
        str('description') ?? str('prompt') ?? ''
      }`.trim();
    case 'WebFetch':
      return `fetch ${str('url') ?? ''}`.trim();
    case 'WebSearch':
      return `search ${str('query') ?? ''}`.trim();
    case 'TodoWrite':
      return 'todo update';
    default:
      return `${name} ${oneLine(JSON.stringify(input)).slice(0, 120)}`.trim();
  }
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text?: unknown }).text ?? '')
          : '',
      )
      .join(' ');
  }
  return content ? JSON.stringify(content) : '';
}

function resetTextFromLimitMessage(text: string) {
  return (
    text.match(/resets?\s+([^·\n]+)/i)?.[1]?.trim() ??
    text.match(/([오전후]{2}\s*\d{1,2}(?::\d{2})?|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)[^.\n]*재설정/i)?.[0]?.trim() ??
    null
  );
}

function datePartsInZone(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ts));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function parseClaudeResetTime(text: string, detectedAt: number) {
  const match = text.match(
    /resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([^)]+)\))?/i,
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  const timeZone = match[4] || 'Asia/Seoul';
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  if (timeZone !== 'Asia/Seoul') return null;
  const { year, month, day } = datePartsInZone(detectedAt, timeZone);
  if (!year || !month || !day) return null;
  let reset = Date.UTC(year, month - 1, day, hour - 9, minute);
  if (reset <= detectedAt - 60_000) reset += 24 * 60 * 60 * 1000;
  return reset;
}

function limitStateFromText(text: string, ts: number): LimitState | null {
  const evidence = clip(safeText(text), 260);
  const resetsAt = parseClaudeResetTime(text, ts);
  const resetText = resetTextFromLimitMessage(text);

  if (/you['’]ve hit your session limit|session limit|usage limit|사용 한도 초과/i.test(text)) {
    return {
      kind: 'usage_limit',
      confidence: 'high',
      evidence,
      detectedAt: ts,
      resetsAt,
      resetText,
    };
  }
  if (/rate limit|too many requests|temporarily.*request|요청.*제한/i.test(text)) {
    return {
      kind: 'rate_limit',
      confidence: 'high',
      evidence,
      detectedAt: ts,
      resetsAt,
      resetText,
    };
  }
  if (/context window|context.*limit|context.*exceeded/i.test(text)) {
    return {
      kind: 'context_limit',
      confidence: 'medium',
      evidence,
      detectedAt: ts,
      resetsAt,
      resetText,
    };
  }
  return null;
}

function isLimitActive(limitState: LimitState | null) {
  if (!limitState) return false;
  if (limitState.resetsAt) return limitState.resetsAt > Date.now();
  return Date.now() - limitState.detectedAt < 6 * 60 * 60 * 1000;
}

function limitStateFromLines(lines: TranscriptLine[]) {
  let latest: LimitState | null = null;
  for (const line of lines) {
    const ts = tsOf(line);
    const stamp = Number.isFinite(ts) ? ts : Date.now();
    const content = line.message?.content;

    if (line.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== 'text' || !block.text?.trim()) continue;
        const limitState = limitStateFromText(block.text, stamp);
        if (limitState) latest = limitState;
      }
    }

    if (line.type === 'system') {
      const raw = JSON.stringify(line);
      if (/StopFailure|rate limit|usage limit|too many requests|429/i.test(raw)) {
        latest = {
          kind: /rate limit|429|too many requests/i.test(raw) ? 'rate_limit' : 'usage_limit',
          confidence: 'medium',
          evidence: clip(safeText(raw), 260),
          detectedAt: stamp,
          resetsAt: null,
          resetText: null,
        };
      }
    }
  }
  return isLimitActive(latest) ? latest : null;
}

function isCharacterEvent(event: MonitorEvent) {
  const text = event.text ?? '';
  if (!text.trim()) return false;
  if (event.kind === 'message' || event.kind === 'error' || event.kind === 'subagent') return true;
  if (event.kind !== 'tool') return false;
  if (event.channel?.startsWith('mcp__Claude_Preview__')) return false;
  if (event.channel === 'TodoWrite') return false;
  return true;
}

function isPrimaryCharacterEvent(event: MonitorEvent) {
  return ['message', 'error', 'subagent'].includes(event.kind) && Boolean(event.text?.trim());
}

function recentCharacterEvents(events: MonitorEvent[]) {
  const primary = events.filter(isPrimaryCharacterEvent);
  if (primary.length) {
    return primary.slice(-8).map((event) => ({
      ts: event.ts,
      kind: event.kind,
      channel: event.channel ?? null,
      text: event.text ?? null,
      source: event.source,
    }));
  }
  const useful = events.filter(isCharacterEvent);
  return (useful.length ? useful : events.filter((event) => event.text?.trim()))
    .slice(-8)
    .map((event) => ({
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
  const toolNames = new Map<string, string>();
  let seq = 0;
  const push = (event: Omit<MonitorEvent, 'id'>) => {
    events.push({ id: `claude-${sessionId}-${seq}`, ...event });
    seq += 1;
  };

  for (const line of lines) {
    const ts = tsOf(line);
    const stamp = Number.isFinite(ts) ? ts : Date.now();
    const content = line.message?.content;

    if (line.type === 'user') {
      if (typeof content === 'string') {
        if (content.trim()) {
          push({
            ts: stamp,
            kind: 'message',
            source: 'user',
            agentName: 'You',
            channel: 'prompt',
            text: clip(safeText(content)),
          });
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            const name = toolNames.get(block.tool_use_id ?? '') ?? 'tool';
            const isError = block.is_error === true;
            const text = oneLine(safeText(resultText(block.content))).slice(0, 200);
            push({
              ts: stamp,
              kind: isError ? 'error' : 'status',
              source: 'tool',
              agentName: 'Claude Code',
              channel: name,
              text: `${name} ${isError ? 'failed' : 'done'}${text ? `: ${text}` : ''}`,
            });
          }
        }
      }
    } else if (line.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text?.trim()) {
          const limitState = limitStateFromText(block.text, stamp);
          push({
            ts: stamp,
            kind: limitState ? 'error' : 'message',
            source: 'assistant',
            agentName: 'Claude Code',
            channel: limitState ? 'limit' : 'message',
            text: clip(safeText(block.text)),
          });
        } else if (block.type === 'thinking' && block.thinking?.trim()) {
          push({
            ts: stamp,
            kind: 'message',
            source: 'assistant',
            agentName: 'Claude Code',
            channel: 'thinking',
            text: clip(safeText(block.thinking)),
          });
        } else if (block.type === 'tool_use' && block.name) {
          if (block.id) toolNames.set(block.id, block.name);
          const isSub = block.name === 'Task';
          push({
            ts: stamp,
            kind: isSub ? 'subagent' : 'tool',
            source: isSub ? 'subagent' : 'tool',
            agentName: 'Claude Code',
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
  sessionId: string,
  lines: TranscriptLine[],
  mtimeMs: number,
  parentThreadId: string | null = null,
) {
  const metaLine = lines.find((line) => line.cwd);
  const customTitle = lines
    .filter((line) => line.type === 'custom-title' && line.customTitle)
    .at(-1)?.customTitle;
  const lastPrompt = lines
    .filter((line) => line.type === 'last-prompt' && line.lastPrompt)
    .at(-1)?.lastPrompt;
  const aiTitle = lines.filter((line) => line.type === 'ai-title' && line.aiTitle).at(-1)?.aiTitle;
  const slug = lines.find((line) => line.slug)?.slug;
  const isSubagent = parentThreadId !== null;
  const firstUser = lines.find(
    (line) => line.type === 'user' && typeof line.message?.content === 'string',
  );
  const firstPrompt =
    firstUser && typeof firstUser.message?.content === 'string'
      ? oneLine(firstUser.message.content).slice(0, 60)
      : undefined;
  const model = lines.filter((line) => line.message?.model).at(-1)?.message?.model;
  const timestamps = lines.map(tsOf).filter((value) => Number.isFinite(value));
  const startedAt = timestamps.length ? Math.min(...timestamps) : mtimeMs;
  const updatedAt = timestamps.length ? Math.max(...timestamps) : mtimeMs;
  const limitState = limitStateFromLines(lines);
  const status = limitState ? 'limited' : Date.now() - updatedAt < 90_000 ? 'running' : 'idle';
  const recentEvents = recentCharacterEvents(eventsFromLines(lines, sessionId));
  const displayTitle =
    customTitle || (lastPrompt ? oneLine(lastPrompt).slice(0, 72) : undefined) || aiTitle;

  return {
    id: sessionId,
    source: 'local' as const,
    recentEvents,
    name: isSubagent
      ? `↳ ${slug || displayTitle || firstPrompt || 'subagent'}`
      : displayTitle || firstPrompt || sessionId,
    cwd: metaLine?.cwd ?? '',
    command: [isSubagent ? 'Claude subagent' : 'Claude Code'],
    status,
    startedAt,
    updatedAt,
    branch: metaLine?.gitBranch ?? null,
    gitHead: null,
    host: os.hostname(),
    model: model ?? null,
    reasoningEffort: null,
    agentName: isSubagent ? slug || 'subagent' : 'Claude Code',
    agentRole: isSubagent ? slug || 'subagent' : null,
    parentThreadId,
    limitState,
  };
}

// Scan every project directory under ~/.claude/projects, not just the current
// cwd, so Claude sessions running in other repos/terminals also show up.
async function listTranscripts() {
  let projects: string[];
  try {
    projects = await fs.readdir(projectsDir);
  } catch {
    return [];
  }
  const transcripts: {
    sessionId: string;
    filePath: string;
    mtimeMs: number;
    parentThreadId: string | null;
  }[] = [];

  const addTranscript = async (
    filePath: string,
    sessionId: string,
    parentThreadId: string | null,
  ) => {
    try {
      const stat = await fs.stat(filePath);
      transcripts.push({ sessionId, filePath, mtimeMs: stat.mtimeMs, parentThreadId });
    } catch {
      // Skip unreadable files.
    }
  };

  await Promise.all(
    projects.map(async (project) => {
      if (project.startsWith('.')) return;
      const dir = path.join(projectsDir, project);
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            // Main session transcript: <project>/<sessionId>.jsonl
            await addTranscript(path.join(dir, entry.name), entry.name.replace(/\.jsonl$/, ''), null);
            return;
          }
          if (entry.isDirectory()) {
            // Subagent transcripts: <project>/<parentSessionId>/subagents/agent-*.jsonl
            const subDir = path.join(dir, entry.name, 'subagents');
            let subFiles: string[];
            try {
              subFiles = await fs.readdir(subDir);
            } catch {
              return;
            }
            await Promise.all(
              subFiles
                .filter((file) => file.endsWith('.jsonl'))
                .map((file) =>
                  addTranscript(path.join(subDir, file), file.replace(/\.jsonl$/, ''), entry.name),
                ),
            );
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
        transcripts.slice(0, maxSessions).map(
          async ({ sessionId, filePath, mtimeMs, parentThreadId }) => {
            const raw = await fs.readFile(filePath, 'utf8');
            return sessionFromLines(sessionId, parseLines(raw), mtimeMs, parentThreadId);
          },
        ),
      )
    ).sort((a, b) => b.updatedAt - a.updatedAt);

    const requested = url.searchParams.get('threadId') || process.env.CLAUDE_THREAD_ID;
    const threadId = requested && sessionIdPattern.test(requested) ? requested : sessions[0]?.id;
    const target = threadId ? transcripts.find((item) => item.sessionId === threadId) : undefined;
    const events = target
      ? eventsFromLines(
          parseLines(await fs.readFile(target.filePath, 'utf8')),
          threadId as string,
          eventLimit,
        )
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
      error: error instanceof Error ? error.message : 'Unable to read local Claude logs',
      sessions: [],
      events: [],
      updatedAt: Date.now(),
    });
  }
}
