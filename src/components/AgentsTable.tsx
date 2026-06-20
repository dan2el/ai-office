'use client';

import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { useAppPreferences } from './AppPreferencesProvider';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId, SelectPlayer } from '@/lib/localWorld';
import { initialsFor, sourceLabel } from '@/lib/agentDisplay';

function roleFor(identity: string, source?: string) {
  if (source) return `${sourceLabel(source)} Agent`;
  const short = identity.split('·')[0]?.trim() ?? identity;
  return short.length > 48 ? `${short.slice(0, 45)}…` : short;
}

function taskFor(state: {
  thinking: boolean;
  lastPlan?: { plan: string };
  lastChat?: { message: { content?: string; type: string } };
  projectSessions?: Array<{ status: string }>;
}) {
  if (state.thinking) return 'Working on current task';
  if (state.lastPlan?.plan) return state.lastPlan.plan;
  const last = state.lastChat?.message;
  if (last?.type === 'responded' && last.content) {
    return last.content.length > 72 ? `${last.content.slice(0, 69)}…` : last.content;
  }
  const running = state.projectSessions?.some((session) => session.status === 'running');
  if (running) return 'Session in progress';
  return 'Waiting for input';
}

function priorityFor(state: {
  thinking: boolean;
  sleeping?: boolean;
  motion: { type: string };
  projectSessions?: Array<{ status: string }>;
}) {
  const running =
    state.thinking ||
    state.motion.type === 'walking' ||
    state.projectSessions?.some((session) => session.status === 'running');
  if (running) return { label: 'High', tone: 'bg-rose-500' };
  if (state.sleeping) return { label: 'Low', tone: 'bg-slate-300' };
  return { label: 'Medium', tone: 'bg-amber-400' };
}

function statusFor(state: {
  thinking: boolean;
  sleeping?: boolean;
  motion: { type: string };
  projectSessions?: Array<{ status: string }>;
}) {
  const online =
    state.thinking ||
    state.motion.type === 'walking' ||
    state.projectSessions?.some((session) => session.status === 'running');
  if (online) return { label: 'Online', tone: 'text-emerald-700' };
  if (state.sleeping) return { label: 'Offline', tone: 'text-slate-400' };
  return { label: 'Idle', tone: 'text-slate-500' };
}

export default function AgentsTable({
  selectedPlayer,
  setSelectedPlayer,
}: {
  selectedPlayer: LocalId | undefined;
  setSelectedPlayer: SelectPlayer;
}) {
  const { preferences } = useAppPreferences();
  const { worldState, getPlayerState } = useLocalWorld();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    return worldState.players
      .map((player) => {
        const state = getPlayerState(player._id);
        if (!state) return null;
        const source = state.projectSessions?.[0]?.source;
        return { player, state, source };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter(({ state }) => {
        if (preferences.showOfflineAgents) return true;
        const online =
          state.thinking ||
          state.motion.type === 'walking' ||
          state.projectSessions?.some((session) => session.status === 'running');
        return online;
      })
      .filter(({ state }) => {
        if (!query.trim()) return true;
        const needle = query.trim().toLowerCase();
        return (
          state.name.toLowerCase().includes(needle) ||
          state.identity.toLowerCase().includes(needle) ||
          taskFor(state).toLowerCase().includes(needle)
        );
      });
  }, [getPlayerState, preferences.showOfflineAgents, query, worldState.players]);

  return (
    <section className="flex shrink-0 flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Agents</h2>
          <p className="mt-0.5 text-sm text-slate-500">{rows.length} in workspace</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search agents</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents…"
              className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-5 py-3">Agent</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Current task</th>
              <th className="px-5 py-3">Priority</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ player, state, source }) => {
              const selected = selectedPlayer === state.id;
              const status = statusFor(state);
              const priority = priorityFor(state);
              return (
                <tr
                  key={player._id}
                  onClick={() => setSelectedPlayer(state.id)}
                  className={clsx(
                    'cursor-pointer transition hover:bg-slate-50',
                    selected && 'bg-teal-50/60',
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={clsx(
                          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          selected ? 'bg-slate-950 text-white' : 'bg-teal-100 text-teal-800',
                        )}
                      >
                        {initialsFor(state.name)}
                        <span
                          className={clsx(
                            'absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white',
                            status.label === 'Online' ? 'bg-emerald-500' : 'bg-slate-300',
                          )}
                        />
                      </span>
                      <span className="truncate font-medium text-slate-950">{state.name}</span>
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 text-slate-600">
                    {roleFor(state.identity, source)}
                  </td>
                  <td className={clsx('px-5 py-3 font-medium', status.tone)}>{status.label}</td>
                  <td className="max-w-[280px] truncate px-5 py-3 text-slate-600">
                    {taskFor(state)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-slate-600">
                      <span className={clsx('h-2 w-2 rounded-full', priority.tone)} />
                      {priority.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    {query.trim() ? 'No agents match your search' : 'No active agents'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {query.trim()
                      ? 'Try a different name or task.'
                      : 'Start a session in Claude, Codex, or Cursor to see it here.'}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
