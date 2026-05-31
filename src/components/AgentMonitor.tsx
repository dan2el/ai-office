'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

type MonitorSource = 'codex' | 'claude';

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

const statusClassName: Record<string, string> = {
  starting: 'bg-yellow-100 text-brown-900',
  running: 'bg-green-200 text-green-950',
  idle: 'bg-clay-100 text-clay-900',
  done: 'bg-silver text-clay-900',
  failed: 'bg-red-200 text-red-950',
  cancelled: 'bg-orange-200 text-orange-950',
};

const sourceClassName: Record<MonitorSource, string> = {
  codex: 'bg-clay-700 text-white',
  claude: 'bg-cyan-700 text-white',
};

const eventClassName: Record<string, string> = {
  stdout: 'border-clay-500 bg-clay-900 text-clay-100',
  stderr: 'border-yellow-200 bg-brown-900 text-yellow-100',
  status: 'border-silver bg-clay-700 text-white',
  tool: 'border-cyan-200 bg-clay-900 text-cyan-100',
  file: 'border-green-200 bg-clay-900 text-green-100',
  git: 'border-purple-200 bg-clay-900 text-purple-100',
  subagent: 'border-pink-200 bg-brown-900 text-pink-100',
  message: 'border-clay-300 bg-clay-900 text-white',
  error: 'border-red-200 bg-brown-900 text-red-100',
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

function shortToolName(channel: string | null | undefined, source: MonitorSource) {
  if (!channel) return 'MODEL';
  if (source === 'claude') return claudeStation(channel);
  if (channel.includes('exec')) return 'SHELL';
  if (channel.includes('patch')) return 'PATCH';
  if (channel.includes('browser') || channel.includes('playwright')) return 'BROWSER';
  if (channel.includes('plan')) return 'PLAN';
  if (channel.includes('stdin')) return 'PTY';
  return channel.replace(/^mcp__/, '').replaceAll('_', ' ').slice(0, 14).toUpperCase();
}

function activityText(session: MonitorSession, events: MonitorEvent[] | undefined) {
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
  if (kind === 'error') return 'bg-red-300';
  if (kind === 'tool') return 'bg-cyan-200';
  if (kind === 'subagent') return 'bg-pink-200';
  if (kind === 'status') return 'bg-yellow-100';
  return 'bg-silver';
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
  const subagents = sessions.filter((candidate) => candidate.parentThreadId === rawThreadId).slice(0, 4);
  const recentEvents = (events ?? []).slice(-7).reverse();
  const activeTool = lastMatching(recentEvents, (event) => event.kind === 'tool')?.channel;
  const activeToolName = shortToolName(activeTool, session.source);
  const running = session.status === 'running';
  const deskLabel = session.source === 'claude' ? 'Claude Code' : 'Codex Desktop';
  const toolStations =
    session.source === 'claude'
      ? ['SHELL', 'EDIT', 'READ', 'SEARCH', 'AGENT', 'WEB']
      : ['SHELL', 'PATCH', 'BROWSER', 'PLAN', 'PTY'];

  return (
    <div className="border-b-4 border-brown-700 bg-clay-900 p-4 text-white">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div
          className="relative min-h-[330px] overflow-hidden border-4 border-clay-500 bg-brown-900"
          style={{
            backgroundImage:
              'linear-gradient(rgba(192,203,220,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(192,203,220,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        >
          <div className="absolute left-4 top-4 border-2 border-silver bg-brown-800 px-3 py-2">
            <div className="text-xs uppercase text-silver">{deskLabel}</div>
            <div className="mt-1 flex items-center gap-2 text-xl uppercase leading-none">
              <span
                className={clsx(
                  'h-3 w-3',
                  running ? 'animate-pulse bg-green-300' : 'bg-clay-300',
                )}
              />
              <span>{activityText(session, events)}</span>
            </div>
          </div>

          <div className="absolute left-1/2 top-16 w-[300px] -translate-x-1/2 sm:w-[360px]">
            <div className="mx-auto h-28 w-64 border-4 border-brown-700 bg-clay-900 p-3 shadow-solid">
              <div className="mb-2 h-3 w-28 bg-cyan-200" />
              <div className="space-y-2">
                {(recentEvents.length ? recentEvents : [{ kind: 'status', text: 'waiting' }]).map(
                  (event, index) => (
                    <div
                      key={`${event.kind}-${index}`}
                      className={clsx('h-2', eventTone(event.kind), index > 3 && 'opacity-50')}
                      style={{ width: `${Math.max(28, 100 - index * 12)}%` }}
                    />
                  ),
                )}
              </div>
            </div>

            <div className="mx-auto h-5 w-16 bg-brown-700" />
            <div className="mx-auto h-8 w-56 border-4 border-brown-700 bg-brown-500" />

            <div className="relative mx-auto mt-4 h-28 w-40">
              <div
                className={clsx(
                  'absolute left-12 top-0 h-12 w-16 border-4 border-brown-900 bg-yellow-100',
                  running && 'animate-pulse',
                )}
              >
                <div className="mx-auto mt-3 h-2 w-8 bg-brown-900" />
              </div>
              <div className="absolute left-8 top-12 h-16 w-24 border-4 border-brown-900 bg-clay-500">
                <div className="mx-auto mt-3 h-3 w-14 bg-cyan-200" />
                <div className="mx-auto mt-3 h-3 w-10 bg-yellow-100" />
              </div>
              <div className="absolute left-0 top-20 h-4 w-10 bg-yellow-100" />
              <div className="absolute right-0 top-20 h-4 w-10 bg-yellow-100" />
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-3">
            {recentEvents.slice(0, 3).map((event) => (
              <div key={event.id} className="border-2 border-clay-500 bg-brown-800 p-2">
                <div className="text-[11px] uppercase text-silver">
                  {formatTime(event.ts)} {shortToolName(event.channel, session.source)}
                </div>
                <div className="mt-1 truncate text-sm">{event.text || event.kind}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="border-4 border-clay-500 bg-brown-900 p-3">
            <div className="text-xs uppercase text-silver">Tool Rack</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {toolStations.map((tool) => (
                <div
                  key={tool}
                  className={clsx(
                    'border-2 px-2 py-3 text-center text-sm',
                    activeToolName === tool
                      ? 'border-cyan-200 bg-cyan-200 text-brown-900'
                      : 'border-clay-500 bg-clay-900 text-silver',
                  )}
                >
                  {tool}
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-[132px] border-4 border-clay-500 bg-brown-900 p-3">
            <div className="text-xs uppercase text-silver">Subagents</div>
            <div className="mt-3 space-y-2">
              {subagents.length ? (
                subagents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 border-2 border-clay-500 bg-clay-900 p-2"
                  >
                    <span
                      className={clsx(
                        'h-4 w-4',
                        agent.status === 'running' ? 'animate-pulse bg-green-300' : 'bg-clay-300',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {agent.agentName || agent.name}
                    </span>
                    <span className="text-xs uppercase text-silver">{agent.agentRole}</span>
                  </div>
                ))
              ) : (
                <div className="border-2 border-clay-500 bg-clay-900 p-3 text-sm text-silver">
                  No active subagents
                </div>
              )}
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
      <div className="flex min-h-0 flex-1 items-center justify-center bg-brown-900 px-4 text-center text-lg text-silver">
        Loading events...
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-brown-900 px-4 text-center text-lg text-silver">
        No events yet.
      </div>
    );
  }

  return (
    <ol
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto bg-brown-900 p-3 font-mono text-sm leading-tight"
    >
      {events.map((event) => (
        <li
          key={event.id}
          className={clsx(
            'mb-2 border-l-4 px-3 py-2',
            eventClassName[event.kind] ?? eventClassName.message,
          )}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-normal opacity-80">
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

function useAgentSource(endpoint: string, threadId: string | null) {
  const [data, setData] = useState<LocalMonitorData>({
    available: false,
    sessions: [],
    events: [],
    updatedAt: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const response = await fetch(
        `${endpoint}${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`,
        { cache: 'no-store' },
      );
      const nextData = (await response.json()) as LocalMonitorData;
      if (!cancelled) setData(nextData);
    };

    void refresh().catch((error) => {
      if (!cancelled) {
        setData({
          available: false,
          sessions: [],
          events: [],
          error: error instanceof Error ? error.message : 'Unable to read local agent logs',
          updatedAt: Date.now(),
        });
      }
    });
    const interval = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [endpoint, threadId]);

  return data;
}

export default function AgentMonitor() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const selectedSource = selectedSessionId
    ? (selectedSessionId.slice(0, selectedSessionId.indexOf(':')) as MonitorSource)
    : null;
  const selectedRaw = selectedSessionId
    ? selectedSessionId.slice(selectedSessionId.indexOf(':') + 1)
    : null;

  const codex = useAgentSource('/api/codex-local', selectedSource === 'codex' ? selectedRaw : null);
  const claude = useAgentSource('/api/claude-local', selectedSource === 'claude' ? selectedRaw : null);

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
    return [...codexSessions, ...claudeSessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [codex.sessions, claude.sessions]);

  const activeSession =
    sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;

  const activeEvents = useMemo<MonitorEvent[] | undefined>(() => {
    if (!activeSession) return undefined;
    if (activeSession.source === 'codex') {
      return activeSession.id === `codex:${codex.threadId}` ? codex.events : undefined;
    }
    return activeSession.id === `claude:${claude.threadId}` ? claude.events : undefined;
  }, [activeSession, codex.threadId, codex.events, claude.threadId, claude.events]);

  const monitorError =
    !codex.available && !claude.available ? claude.error || codex.error : undefined;

  return (
    <section className="mx-auto mt-6 w-full max-w-[1400px] game-frame bg-brown-300 text-brown-100">
      <div className="grid h-[760px] min-h-0 overflow-hidden bg-brown-300 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="h-full min-h-0 overflow-y-auto border-b-4 border-brown-700 bg-brown-800 p-4 lg:border-b-0 lg:border-r-4 lg:border-r-brown-700">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl tracking-normal text-white shadow-solid">
              Agent Monitor
            </h2>
            <span className="bg-brown-900 px-2 py-1 text-xs uppercase text-silver">
              {sessions.length}
            </span>
          </div>

          <div className="space-y-2">
            {monitorError && (
              <div className="bg-brown-900 p-3 text-xs leading-tight text-yellow-100">
                Local monitor unavailable: {monitorError}
              </div>
            )}
            {sessions.length === 0 && (
              <div className="bg-brown-900 p-3 text-silver">No agent sessions yet.</div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={clsx(
                  'block w-full border-2 p-3 text-left leading-tight',
                  activeSession?.id === session.id
                    ? 'border-white bg-brown-500 text-white'
                    : 'border-brown-700 bg-brown-900 text-silver hover:border-silver',
                )}
              >
                <span className="block truncate text-base text-white">{session.name}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs uppercase">
                  <span className={clsx('px-2 py-1', sourceClassName[session.source])}>
                    {session.source}
                  </span>
                  <span
                    className={clsx(
                      'px-2 py-1',
                      statusClassName[session.status] ?? 'bg-clay-100 text-clay-900',
                    )}
                  >
                    {session.status}
                  </span>
                  <span>{formatAge(session.updatedAt)} ago</span>
                  {session.agentRole && <span>{session.agentRole}</span>}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-col bg-brown-200 text-brown-900">
          {activeSession ? (
            <>
              <header className="shrink-0 border-b-4 border-brown-700 bg-brown-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-3xl tracking-normal text-brown-900">
                      {activeSession.name}
                    </h3>
                    <p className="mt-1 truncate text-sm text-brown-700">{activeSession.cwd}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx('px-3 py-2 text-sm uppercase', sourceClassName[activeSession.source])}
                    >
                      {activeSession.source}
                    </span>
                    <span
                      className={clsx(
                        'px-3 py-2 text-sm uppercase',
                        statusClassName[activeSession.status] ?? 'bg-clay-100 text-clay-900',
                      )}
                    >
                      {activeSession.status}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase text-brown-700">
                  {activeSession.branch && <span>branch {activeSession.branch}</span>}
                  {activeSession.gitHead && <span>head {activeSession.gitHead}</span>}
                  {activeSession.host && <span>host {activeSession.host}</span>}
                  {activeSession.model && <span>model {activeSession.model}</span>}
                  {activeSession.reasoningEffort && (
                    <span>effort {activeSession.reasoningEffort}</span>
                  )}
                  <span>started {formatTime(activeSession.startedAt)}</span>
                </div>
              </header>
              <LiveWorkFloor
                session={activeSession}
                sessions={sessions}
                events={activeEvents ?? undefined}
              />
              <EventList key={activeSession.id} events={activeEvents ?? undefined} />
            </>
          ) : (
            <div className="flex min-h-[460px] items-center justify-center bg-brown-900 px-4 text-center text-lg text-silver">
              Waiting for agent sessions.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
