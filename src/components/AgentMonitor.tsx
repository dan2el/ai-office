'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppPreferences } from './AppPreferencesProvider';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId } from '@/lib/localWorld';
import { sessionMatchesPlayer } from '@/lib/monitorSessions';
import { initialsFor } from '@/lib/agentDisplay';

type MonitorSource = 'codex' | 'claude' | 'cursor';

type LimitState = {
  kind: 'usage_limit' | 'rate_limit' | 'context_limit' | 'suspected';
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  detectedAt: number;
  resetsAt?: number | null;
  resetText?: string | null;
};

type MonitorSession = {
  id: string;
  source: MonitorSource;
  name: string;
  cwd: string;
  command?: string[];
  status: string;
  startedAt: number;
  updatedAt: number;
  branch?: string | null;
  gitHead?: string | null;
  host?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  agentName?: string | null;
  agentRole?: string | null;
  parentThreadId?: string | null;
  limitState?: LimitState | null;
  recentEvents?: MonitorEvent[];
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

type LocalMonitorData = {
  available: boolean;
  threadId?: string;
  sessions: MonitorSession[];
  events: MonitorEvent[];
  error?: string;
  updatedAt: number;
};

type HandoffDraft = {
  sessionId: string;
  target: MonitorSource;
  text: string;
  copied: boolean;
  error?: string;
};

const monitorSources: MonitorSource[] = ['codex', 'claude', 'cursor'];

const statusClassName: Record<string, string> = {
  starting: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  running: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  idle: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  done: 'bg-slate-900 text-white',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  cancelled: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  limited: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
};

const sourceClassName: Record<MonitorSource, string> = {
  codex: 'bg-slate-950 text-white',
  claude: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  cursor: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
};

const eventClassName: Record<string, string> = {
  stdout: 'border-slate-200 bg-white text-slate-700',
  stderr: 'border-amber-200 bg-amber-50 text-amber-800',
  status: 'border-slate-200 bg-slate-50 text-slate-700',
  tool: 'border-sky-200 bg-sky-50 text-sky-800',
  file: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  git: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  subagent: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
  message: 'border-slate-200 bg-white text-slate-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

function formatTime(ts: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ts));
}

function formatAge(ts: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function limitLabel(limitState: LimitState | null | undefined) {
  if (!limitState) return null;
  if (limitState.kind === 'rate_limit') return 'RATE LIMITED';
  if (limitState.kind === 'context_limit') return 'CONTEXT LIMIT';
  if (limitState.kind === 'suspected') return 'LIMIT SUSPECTED';
  return 'USAGE LIMIT';
}

function limitDetail(limitState: LimitState | null | undefined) {
  if (!limitState) return null;
  if (limitState.resetsAt) return `resets ${formatTime(limitState.resetsAt)}`;
  if (limitState.resetText) return `resets ${limitState.resetText}`;
  return limitState.confidence;
}

function isLimitStateActive(limitState: LimitState | null | undefined) {
  if (!limitState) return false;
  if (limitState.resetsAt) return limitState.resetsAt > Date.now();
  return Date.now() - limitState.detectedAt < 6 * 60 * 60 * 1000;
}

function currentLimitState(session: MonitorSession | null | undefined) {
  if (!session || !isLimitStateActive(session.limitState)) return null;
  return session.limitState ?? null;
}

function effectiveStatus(session: MonitorSession) {
  if (session.status === 'limited' && !currentLimitState(session)) return 'idle';
  return session.status;
}

function sourceLabel(source: MonitorSource) {
  if (source === 'codex') return 'Codex';
  if (source === 'claude') return 'Claude';
  return 'Cursor';
}

function rawSessionId(session: MonitorSession) {
  const prefix = `${session.source}:`;
  return session.id.startsWith(prefix) ? session.id.slice(prefix.length) : session.id;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function contextUrlForSession(session: MonitorSession) {
  const origin = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
  return `${origin}/api/${session.source}-local?threadId=${encodeURIComponent(
    rawSessionId(session),
  )}&full=1`;
}

function sourceAccessHints(session: MonitorSession) {
  const id = rawSessionId(session);
  if (session.source === 'codex') {
    return [
      '- Codex 원본 DB: ~/.codex/state_5.sqlite, ~/.codex/logs_2.sqlite',
      `- Codex rollout 확인: sqlite3 -readonly ~/.codex/state_5.sqlite ${shellQuote(
        `select rollout_path,title,cwd from threads where id=${sqlQuote(id)};`,
      )}`,
    ];
  }
  if (session.source === 'claude') {
    return [
      `- Claude 원본 JSONL 찾기: find ~/.claude/projects -name ${shellQuote(
        `${id}.jsonl`,
      )} -print`,
    ];
  }

  const separator = id.lastIndexOf(':');
  if (separator === -1) {
    return ['- Cursor 원본 JSONL: ~/.cursor/projects/*/agent-transcripts/<sessionId>/<sessionId>.jsonl'];
  }
  const projectSlug = id.slice(0, separator);
  const sessionId = id.slice(separator + 1);
  return [
    `- Cursor 원본 JSONL: ~/.cursor/projects/${projectSlug}/agent-transcripts/${sessionId}/${sessionId}.jsonl`,
  ];
}

function eventDataText(data: unknown) {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return '[event data unavailable]';
  }
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return '클립보드 API를 사용할 수 없어 초안만 생성했습니다.';
  }

  try {
    await navigator.clipboard.writeText(text);
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      return '브라우저가 클립보드 복사를 막아서 초안만 생성했습니다.';
    }
    return '클립보드 복사는 실패했지만 초안은 생성했습니다.';
  }
}

function buildHandoffPrompt(
  session: MonitorSession,
  target: MonitorSource,
  events: MonitorEvent[] | undefined,
) {
  const limitState = currentLimitState(session);
  const contextUrl = contextUrlForSession(session);
  const contextCommand = `curl -s ${shellQuote(contextUrl)} > /tmp/agent-session-context.json`;
  const usefulEvents = (events?.length ? events : session.recentEvents ?? []).slice(-28);
  const lines = usefulEvents.map((event) => {
    const who = event.agentName || event.source;
    const channel = event.channel ? `/${event.channel}` : '';
    const text = (event.text || eventDataText(event.data))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 900);
    return `- ${new Date(event.ts).toISOString()} ${who}${channel}: ${text}`;
  });

  return [
    `다음 ${sourceLabel(session.source)} 세션이 사용 한도 때문에 중단되었습니다. ${sourceLabel(
      target,
    )}에서 이어서 진행하세요.`,
    '',
    '기본 정보:',
    `- 원래 AI: ${sourceLabel(session.source)}`,
    `- 이어받을 AI: ${sourceLabel(target)}`,
    `- 세션: ${session.name}`,
    `- 프로젝트 경로: ${session.cwd || '(unknown)'}`,
    session.branch ? `- 브랜치: ${session.branch}` : null,
    session.gitHead ? `- HEAD: ${session.gitHead}` : null,
    session.model ? `- 모델: ${session.model}` : null,
    limitState ? `- 제한 상태: ${limitLabel(limitState)} / ${limitDetail(limitState)}` : null,
    limitState?.evidence ? `- 제한 근거: ${limitState.evidence}` : null,
    '',
    '전체 세션 컨텍스트:',
    `- 먼저 실행: ${contextCommand}`,
    '- /tmp/agent-session-context.json의 events 전체를 읽고 마지막 사용자 요청, 진행 중인 작업, 수정 파일, 실패 지점을 파악하세요.',
    '- 아래 최근 이벤트는 미리보기일 뿐이며, 판단은 전체 컨텍스트를 우선하세요.',
    ...sourceAccessHints(session),
    '',
    '진행 규칙:',
    '- 이미 끝난 작업을 반복하지 말고, 먼저 현재 파일 상태와 최근 변경을 확인하세요.',
    '- 사용자의 마지막 요청을 기준으로 이어서 진행하세요.',
    '- 원래 AI가 reset 시간 이후 다시 사용 가능해졌다면, 새 작업을 시작하기 전에 원래 세션 재개가 더 나은지 판단하세요.',
    '- 필요한 경우 짧은 현황 요약 후 바로 구현/검증을 진행하세요.',
    '',
    '최근 세션 이벤트:',
    ...(lines.length ? lines : ['- 최근 이벤트를 읽지 못했습니다. 프로젝트 상태부터 확인하세요.']),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function projectLabel(cwd: string | undefined) {
  if (!cwd) return 'unknown project';
  const parts = cwd.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || cwd;
  if (parts.length >= 2 && (/^\d+$/.test(last) || last.length <= 2)) {
    return parts.slice(-2).join('/');
  }
  return last;
}

function lastMatching<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i])) return items[i];
  }
  return null;
}

function claudeStation(channel: string) {
  const name = channel.toLowerCase();
  if (name === 'bash') return 'SHELL';
  if (['edit', 'write', 'multiedit', 'notebookedit'].includes(name)) return 'EDIT';
  if (name === 'read') return 'READ';
  if (['grep', 'glob'].includes(name)) return 'SEARCH';
  if (name === 'task') return 'AGENT';
  if (['webfetch', 'websearch'].includes(name)) return 'WEB';
  if (name === 'todowrite') return 'PLAN';
  if (name === 'thinking') return 'THINK';
  if (name === 'prompt' || name === 'message') return 'CHAT';
  if (name.startsWith('mcp__')) {
    return channel.replace(/^mcp__/, '').replaceAll('_', ' ').slice(0, 14).toUpperCase();
  }
  return channel.slice(0, 12).toUpperCase();
}

function cursorStation(channel: string) {
  const name = channel.toLowerCase();
  if (name === 'shell') return 'SHELL';
  if (['write', 'strreplace', 'delete', 'editnotebook'].includes(name)) return 'EDIT';
  if (name === 'read') return 'READ';
  if (['grep', 'glob'].includes(name)) return 'SEARCH';
  if (name === 'task') return 'AGENT';
  if (name === 'callmcptool') return 'MCP';
  if (['webfetch', 'websearch'].includes(name)) return 'WEB';
  if (name === 'prompt' || name === 'message') return 'CHAT';
  return channel.slice(0, 12).toUpperCase();
}

function shortToolName(channel: string | null | undefined, source: MonitorSource) {
  if (!channel) return 'MODEL';
  if (source === 'claude') return claudeStation(channel);
  if (source === 'cursor') return cursorStation(channel);
  if (channel.includes('exec')) return 'SHELL';
  if (channel.includes('patch')) return 'PATCH';
  if (channel.includes('browser') || channel.includes('playwright')) return 'BROWSER';
  if (channel.includes('plan')) return 'PLAN';
  if (channel.includes('stdin')) return 'PTY';
  return channel.replace(/^mcp__/, '').replaceAll('_', ' ').slice(0, 14).toUpperCase();
}

function activityText(session: MonitorSession, events: MonitorEvent[] | undefined) {
  const limitState = currentLimitState(session);
  if (limitState) return limitLabel(limitState) ?? 'LIMIT HIT';
  const latest = events?.at(-1);
  if (!latest) return session.status === 'running' ? 'WAITING FOR SIGNAL' : 'IDLE';
  if (latest.kind === 'tool') return `${shortToolName(latest.channel, session.source)} ACTIVE`;
  if (latest.kind === 'subagent') return 'SUBAGENT ACTIVE';
  if (latest.kind === 'error') return 'ATTENTION NEEDED';
  if (latest.channel === 'turn' || latest.channel === 'thinking') return 'MODEL THINKING';
  if (latest.kind === 'status') return `${shortToolName(latest.channel, session.source)} UPDATE`;
  return latest.kind.toUpperCase();
}

function eventTone(kind: string) {
  if (kind === 'error') return 'bg-rose-400';
  if (kind === 'tool') return 'bg-sky-400';
  if (kind === 'subagent') return 'bg-fuchsia-400';
  if (kind === 'status') return 'bg-amber-400';
  return 'bg-slate-300';
}

function isSubagentSession(session: MonitorSession) {
  return Boolean(
    session.parentThreadId ||
      session.agentRole === 'subagent' ||
      session.name.trim().startsWith('↳'),
  );
}

function LiveWorkFloor({
  session,
  sessions,
  events,
}: {
  session: MonitorSession;
  sessions: MonitorSession[];
  events: MonitorEvent[] | undefined;
}) {
  const rawThreadId = session.id.includes(':') ? session.id.slice(session.id.indexOf(':') + 1) : session.id;
  const directSubagents = sessions.filter((candidate) => candidate.parentThreadId === rawThreadId);
  const projectSubagents = sessions.filter(
    (candidate) =>
      candidate.id !== session.id &&
      isSubagentSession(candidate) &&
      candidate.cwd === session.cwd,
  );
  const subagents = (directSubagents.length ? directSubagents : projectSubagents).slice(0, 6);
  const subagentLabel = directSubagents.length ? 'Direct subagents' : 'Project subagents';
  const recentEvents = (events ?? []).slice(-7).reverse();
  const activeTool = lastMatching(recentEvents, (event) => event.kind === 'tool')?.channel;
  const activeToolName = shortToolName(activeTool, session.source);
  const running = effectiveStatus(session) === 'running';
  const deskLabel =
    session.source === 'claude'
      ? 'Claude Code'
      : session.source === 'cursor'
        ? 'Cursor Agent'
        : 'Codex Desktop';
  const toolStations =
    session.source === 'claude' || session.source === 'cursor'
      ? ['SHELL', 'EDIT', 'READ', 'SEARCH', 'AGENT', 'WEB']
      : ['SHELL', 'PATCH', 'BROWSER', 'PLAN', 'PTY'];

  return (
    <div className="border-b border-slate-200 bg-white p-4">
      <div className="grid gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Subagents
              </div>
              <div className="mt-1 text-xs text-slate-500">{subagentLabel}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {subagents.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {subagents.length ? (
              subagents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2"
                >
                  <span
                    className={clsx(
                      'h-2 w-2 shrink-0 rounded-full',
                      agent.status === 'running' ? 'animate-pulse bg-emerald-500' : 'bg-slate-300',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-700">
                      {agent.name.replace(/^↳\s*/, '')}
                    </span>
                    <span className="mt-0.5 block truncate text-xs uppercase tracking-[0.08em] text-slate-500">
                      {sourceLabel(agent.source)} · {agent.status}
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500 sm:col-span-3">
                No subagents for this session or project
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {deskLabel}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-950">
                <span
                  className={clsx(
                    'h-2 w-2 shrink-0 rounded-full',
                    running ? 'animate-pulse bg-emerald-500' : 'bg-slate-300',
                  )}
                />
                <span className="truncate">{activityText(session, events)}</span>
              </div>
            </div>
            <span
              className={clsx(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                running
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-slate-100 text-slate-600',
              )}
            >
              {effectiveStatus(session)}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {(recentEvents.length ? recentEvents : [{ kind: 'status', text: 'waiting' }]).map(
              (event, index) => (
                <div
                  key={`${event.kind}-${index}`}
                  className={clsx(
                    'h-2 rounded-full',
                    eventTone(event.kind),
                    index > 3 && 'opacity-50',
                  )}
                  style={{ width: `${Math.max(28, 100 - index * 12)}%` }}
                />
              ),
            )}
          </div>
          {recentEvents.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {recentEvents.slice(0, 3).map((event) => (
                <div key={event.id} className="min-w-0 rounded-md border border-slate-200 bg-white p-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    {formatTime(event.ts)}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-700">
                    {shortToolName(event.channel, session.source)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Tool rack
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {toolStations.map((tool) => (
                <div
                  key={tool}
                  className={clsx(
                    'rounded-md border px-2 py-3 text-center text-xs font-semibold',
                    activeToolName === tool
                      ? 'border-teal-300 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-slate-50 text-slate-500',
                  )}
                >
                  {tool}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventList({ events }: { events: MonitorEvent[] | undefined }) {
  const scrollRef = useRef<HTMLOListElement>(null);
  // Stay pinned to the newest event (messenger-style) unless the user scrolled up.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (!events) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-500">
        Loading events...
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-500">
        No events yet.
      </div>
    );
  }

  return (
    <ol
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 text-sm leading-6"
    >
      {events.map((event) => (
        <li
          key={event.id}
          className={clsx(
            'mb-3 rounded-lg border px-3 py-2.5 shadow-sm',
            eventClassName[event.kind] ?? eventClassName.message,
          )}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] opacity-70">
            <time dateTime={new Date(event.ts).toISOString()}>{formatTime(event.ts)}</time>
            <span>{event.kind}</span>
            <span>{event.agentName || event.source}</span>
            {event.channel && <span>{event.channel}</span>}
          </div>
          <p className="whitespace-pre-wrap break-words">
            {event.text || JSON.stringify(event.data)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function useAgentSource(endpoint: string, threadId: string | null, refreshIntervalMs: number) {
  const [data, setData] = useState<LocalMonitorData>({
    available: false,
    sessions: [],
    events: [],
    updatedAt: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const response = await fetch(
          `${endpoint}${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`,
          { cache: 'no-store' },
        );
        const nextData = (await response.json()) as LocalMonitorData;
        if (!cancelled) setData(nextData);
      } catch (error) {
        if (!cancelled) {
          setData({
            available: false,
            sessions: [],
            events: [],
            error: error instanceof Error ? error.message : 'Unable to read local agent logs',
            updatedAt: Date.now(),
          });
        }
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(() => {
            void refresh();
          }, refreshIntervalMs);
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [endpoint, refreshIntervalMs, threadId]);

  return data;
}

type MonitorTab = 'all' | 'messages' | 'tools' | 'system';

type ActivityItem = {
  id: string;
  session: MonitorSession;
  event: MonitorEvent;
};

function matchesMonitorTab(event: MonitorEvent, tab: MonitorTab) {
  if (tab === 'all') return true;
  // Messages: agent <-> user conversation only.
  if (tab === 'messages') return event.kind === 'message';
  // Tools: tool calls and spawned subagents.
  if (tab === 'tools') return event.kind === 'tool' || event.kind === 'subagent';
  // System: everything else — status updates, errors, file/git/stderr activity.
  return !['message', 'tool', 'subagent'].includes(event.kind);
}

// Strip common markdown so one-line summaries read cleanly (no raw ** or `).
function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])[*_]([^*_]+)[*_]/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function activityDescription(event: MonitorEvent, source: MonitorSource) {
  const text = stripMarkdown(event.text || eventDataText(event.data));
  if (text) return text.length > 96 ? `${text.slice(0, 93)}…` : text;
  if (event.kind === 'tool') return `${shortToolName(event.channel, source)} tool call`;
  if (event.kind === 'subagent') return 'Subagent activity';
  return event.kind;
}

function buildActivityFeed(sessions: MonitorSession[], tab: MonitorTab): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const session of sessions) {
    for (const event of session.recentEvents ?? []) {
      if (!matchesMonitorTab(event, tab)) continue;
      items.push({ id: `${session.id}:${event.id}`, session, event });
    }
  }
  return items.sort((a, b) => b.event.ts - a.event.ts).slice(0, 40);
}

export default function AgentMonitor({
  compact = false,
  selectedPlayer,
}: {
  compact?: boolean;
  selectedPlayer?: LocalId;
} = {}) {
  const { preferences } = useAppPreferences();
  const { getPlayerState } = useLocalWorld();
  const selectedPlayerState = selectedPlayer ? getPlayerState(selectedPlayer) : undefined;
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [monitorTab, setMonitorTab] = useState<MonitorTab>('all');
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [handoffTarget, setHandoffTarget] = useState<MonitorSource>('codex');
  const [handoffDraft, setHandoffDraft] = useState<HandoffDraft | null>(null);
  const selectedSource = selectedSessionId
    ? (selectedSessionId.slice(0, selectedSessionId.indexOf(':')) as MonitorSource)
    : null;
  const selectedRaw = selectedSessionId
    ? selectedSessionId.slice(selectedSessionId.indexOf(':') + 1)
    : null;

  const codex = useAgentSource(
    '/api/codex-local',
    selectedSource === 'codex' ? selectedRaw : null,
    preferences.refreshIntervalMs,
  );
  const claude = useAgentSource(
    '/api/claude-local',
    selectedSource === 'claude' ? selectedRaw : null,
    preferences.refreshIntervalMs,
  );
  const cursor = useAgentSource(
    '/api/cursor-local',
    selectedSource === 'cursor' ? selectedRaw : null,
    preferences.refreshIntervalMs,
  );

  const sessions = useMemo<MonitorSession[]>(() => {
    const codexSessions = codex.sessions.map((session) => ({
      ...session,
      id: `codex:${session.id}`,
      source: 'codex' as const,
    }));
    const claudeSessions = claude.sessions.map((session) => ({
      ...session,
      id: `claude:${session.id}`,
      source: 'claude' as const,
    }));
    const cursorSessions = cursor.sessions.map((session) => ({
      ...session,
      id: `cursor:${session.id}`,
      source: 'cursor' as const,
    }));
    return [...codexSessions, ...claudeSessions, ...cursorSessions].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [codex.sessions, claude.sessions, cursor.sessions]);

  const scopedSessions = useMemo(() => {
    if (!selectedPlayer || !selectedPlayerState) return sessions;
    const matched = sessions.filter((session) =>
      sessionMatchesPlayer(session, selectedPlayer, selectedPlayerState),
    );
    return matched.length > 0 ? matched : sessions;
  }, [selectedPlayer, selectedPlayerState, sessions]);

  const isFilteredToPlayer =
    Boolean(selectedPlayer && selectedPlayerState) &&
    scopedSessions.length < sessions.length;

  useEffect(() => {
    if (!selectedPlayer || !selectedPlayerState) return;

    const matched = sessions.filter((session) =>
      sessionMatchesPlayer(session, selectedPlayer, selectedPlayerState),
    );
    if (!matched.length) return;

    const preferred =
      matched.find((session) => session.status === 'running') ??
      matched.find((session) => session.status === 'limited') ??
      matched[0];

    setSelectedSessionId((current) => {
      if (current && matched.some((session) => session.id === current)) {
        return current;
      }
      return preferred.id;
    });

    if (preferences.autoOpenMonitorOnSelect) {
      setShowSessionDetails(true);
    }
  }, [preferences.autoOpenMonitorOnSelect, selectedPlayer, selectedPlayerState, sessions]);

  const activeSession =
    scopedSessions.find((session) => session.id === selectedSessionId) ??
    scopedSessions[0] ??
    null;

  const activeEvents = useMemo<MonitorEvent[] | undefined>(() => {
    if (!activeSession) return undefined;
    if (activeSession.source === 'codex') {
      return activeSession.id === `codex:${codex.threadId}` ? codex.events : undefined;
    }
    if (activeSession.source === 'claude') {
      return activeSession.id === `claude:${claude.threadId}` ? claude.events : undefined;
    }
    return activeSession.id === `cursor:${cursor.threadId}` ? cursor.events : undefined;
  }, [
    activeSession,
    codex.threadId,
    codex.events,
    claude.threadId,
    claude.events,
    cursor.threadId,
    cursor.events,
  ]);

  const monitorError =
    !codex.available && !claude.available && !cursor.available
      ? cursor.error || claude.error || codex.error
      : undefined;
  const activeLimitState = currentLimitState(activeSession);
  const handoffTargets = activeSession
    ? monitorSources.filter((source) => source !== activeSession.source)
    : [];
  const selectedHandoffTarget = handoffTargets.includes(handoffTarget)
    ? handoffTarget
    : handoffTargets[0] ?? 'codex';

  const createHandoffDraft = async () => {
    if (!activeSession || !activeLimitState) return;
    const text = buildHandoffPrompt(activeSession, selectedHandoffTarget, activeEvents);
    const nextDraft: HandoffDraft = {
      sessionId: activeSession.id,
      target: selectedHandoffTarget,
      text,
      copied: false,
    };
    setHandoffDraft(nextDraft);
    const error = await copyTextToClipboard(text);
    setHandoffDraft((current) => {
      if (!current || current.sessionId !== nextDraft.sessionId || current.text !== nextDraft.text) {
        return current;
      }
      return { ...current, copied: !error, error: error ?? undefined };
    });
  };

  const copyHandoffDraft = async () => {
    if (!handoffDraft) return;
    const draft = handoffDraft;
    const error = await copyTextToClipboard(draft.text);
    setHandoffDraft((current) => {
      if (!current || current.sessionId !== draft.sessionId || current.text !== draft.text) {
        return current;
      }
      return { ...current, copied: !error, error: error ?? undefined };
    });
  };

  const activityFeed = useMemo(
    () => buildActivityFeed(scopedSessions, monitorTab),
    [monitorTab, scopedSessions],
  );

  if (compact) {
    return (
      <section className="flex h-full min-h-0 flex-col bg-white">
        <div className="shrink-0 border-b border-slate-200 px-4 py-4">
          <h2 className="text-base font-semibold text-slate-950">Monitor</h2>
          {isFilteredToPlayer && selectedPlayerState && (
            <p className="mt-1 text-xs text-teal-700">
              Filtered to {selectedPlayerState.name}
            </p>
          )}
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ['all', 'All'],
                ['messages', 'Messages'],
                ['tools', 'Tools'],
                ['system', 'System'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setMonitorTab(tab)}
                className={clsx(
                  'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                  monitorTab === tab
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {monitorError && (
            <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              Couldn&apos;t read local sessions yet — the dev server may still be starting. This
              retries automatically.
            </div>
          )}

          {activityFeed.length === 0 && !monitorError && (
            <div className="flex h-full min-h-[240px] items-center justify-center px-4 text-center text-sm text-slate-500">
              {isFilteredToPlayer
                ? 'No monitor activity for this agent yet.'
                : 'No activity yet.'}
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {activityFeed.map(({ id, session, event }) => {
              const selected = activeSession?.id === session.id;
              const name = session.agentName || session.name;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setShowSessionDetails(true);
                    }}
                    className={clsx(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50',
                      selected && showSessionDetails && 'bg-teal-50/50',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
                      {initialsFor(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm text-slate-950">
                        <span className="font-semibold">{name}</span>
                        <span className="text-slate-600"> — {activityDescription(event, session.source)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {formatAge(event.ts)} ago · {session.source}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {showSessionDetails && activeSession ? (
          <div className="shrink-0 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <span className="truncate text-sm font-semibold text-slate-950">
                {activeSession.name}
              </span>
              <button
                type="button"
                onClick={() => setShowSessionDetails(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            {activeLimitState && (
              <div className="border-b border-rose-100 bg-rose-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-rose-700">
                    {limitLabel(activeLimitState)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void createHandoffDraft()}
                    className="rounded-md bg-rose-600 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
                  >
                    Handoff
                  </button>
                </div>
              </div>
            )}
            <div className="max-h-56 overflow-hidden">
              <EventList key={activeSession.id} events={activeEvents ?? undefined} />
            </div>
          </div>
        ) : (
          <div className="shrink-0 border-t border-slate-200 p-3">
            <button
              type="button"
              onClick={() => {
                if (scopedSessions[0]) {
                  setSelectedSessionId(scopedSessions[0].id);
                  setShowSessionDetails(true);
                }
              }}
              disabled={!scopedSessions.length}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              View all activity
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(160px,34%)_minmax(0,1fr)] overflow-hidden bg-white xl:grid-cols-[320px_minmax(0,1fr)] xl:grid-rows-none">
        <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 p-4 min-[1800px]:border-b-0 min-[1800px]:border-r">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Monitor</h2>
              <p className="mt-1 text-sm text-slate-500">Local agent sessions</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {sessions.length}
            </span>
          </div>

          <div className="space-y-2">
            {monitorError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Couldn&apos;t read local sessions yet — the dev server may still be starting. This
                retries automatically.
              </div>
            )}
            {sessions.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                No agent sessions yet.
              </div>
            )}
            {sessions.map((session) => {
              const sessionLimitState = currentLimitState(session);
              const status = effectiveStatus(session);
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSessionId(session.id)}
                  className={clsx(
                    'block w-full rounded-lg border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                    activeSession?.id === session.id
                      ? 'border-teal-400 bg-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300',
                  )}
                >
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {session.name}
                  </span>
                  <span
                    className="mt-1 block truncate text-xs text-slate-500"
                    title={session.cwd}
                  >
                    {projectLabel(session.cwd)}
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]">
                    <span className={clsx('rounded-full px-2 py-1', sourceClassName[session.source])}>
                      {session.source}
                    </span>
                    {sessionLimitState && (
                      <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-200">
                        {limitLabel(sessionLimitState)}
                      </span>
                    )}
                    <span
                      className={clsx(
                        'rounded-full px-2 py-1',
                        statusClassName[status] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
                      )}
                    >
                      {status}
                    </span>
                    {sessionLimitState && (
                      <span className="text-rose-700">{limitDetail(sessionLimitState)}</span>
                    )}
                    <span className="text-slate-500">{formatAge(session.updatedAt)} ago</span>
                    {session.agentRole && <span>{session.agentRole}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-col bg-white text-slate-950">
          {activeSession ? (
            <>
              <header className="shrink-0 border-b border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-950">
                      {activeSession.name}
                    </h3>
                    <p className="mt-1 truncate text-sm text-slate-500">{activeSession.cwd}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]', sourceClassName[activeSession.source])}>
                      {activeSession.source}
                    </span>
                    {activeLimitState && (
                      <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-rose-700 ring-1 ring-rose-200">
                        {limitLabel(activeLimitState)}
                      </span>
                    )}
                    <span
                      className={clsx(
                        'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]',
                        statusClassName[effectiveStatus(activeSession)] ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
                      )}
                    >
                      {effectiveStatus(activeSession)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.08em] text-slate-500">
                  {activeSession.branch && <span>branch {activeSession.branch}</span>}
                  {activeSession.gitHead && <span>head {activeSession.gitHead}</span>}
                  {activeSession.host && <span>host {activeSession.host}</span>}
                  {activeSession.model && <span>model {activeSession.model}</span>}
                  {activeSession.reasoningEffort && (
                    <span>effort {activeSession.reasoningEffort}</span>
                  )}
                  {activeLimitState && (
                    <span>{limitDetail(activeLimitState)}</span>
                  )}
                  <span>started {formatTime(activeSession.startedAt)}</span>
                </div>
                {activeLimitState && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.08em]">
                        {handoffTargets.map((target) => (
                          <button
                            key={target}
                            type="button"
                            onClick={() => setHandoffTarget(target)}
                            className={clsx(
                              'rounded-md border px-2 py-1 transition',
                              selectedHandoffTarget === target
                                ? 'border-slate-950 bg-slate-950 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500',
                            )}
                          >
                            {sourceLabel(target)}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => void createHandoffDraft()}
                        className="rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-sm transition hover:bg-rose-700"
                      >
                        다른 AI로 이어서 진행
                      </button>
                    </div>
                    {handoffDraft?.sessionId === activeSession.id && (
                      <div className="mt-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-[0.08em] text-slate-600">
                          <span>
                            {sourceLabel(handoffDraft.target)} 이어받기 초안
                            {handoffDraft.copied ? ' 복사됨' : ' 생성됨'}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyHandoffDraft()}
                            className="rounded-md bg-slate-950 px-2 py-1 text-white"
                          >
                            복사
                          </button>
                        </div>
                        {handoffDraft.error && (
                          <div className="mb-2 text-xs text-red-800">{handoffDraft.error}</div>
                        )}
                        <textarea
                          readOnly
                          value={handoffDraft.text}
                          className="h-28 w-full resize-none rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-800"
                        />
                      </div>
                    )}
                  </div>
                )}
              </header>
              <LiveWorkFloor
                session={activeSession}
                sessions={sessions}
                events={activeEvents ?? undefined}
              />
              <EventList key={activeSession.id} events={activeEvents ?? undefined} />
            </>
          ) : (
            <div className="flex min-h-[460px] items-center justify-center bg-slate-50 px-4 text-center text-sm text-slate-500">
              Waiting for agent sessions.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
