'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId, LocalPlayerState, SelectPlayer } from '@/lib/localWorld';
import { initialsFor, sourceTone } from '@/lib/agentDisplay';

function clampPercent(value: number) {
  return `${Math.max(4, Math.min(96, value))}%`;
}

function positionForDisplay(state: LocalPlayerState) {
  if (state.motion.type === 'stopped') return state.motion.pose.position;
  return state.motion.route[0];
}

export default function OfficeMap({
  selectedPlayer,
  setSelectedPlayer,
}: {
  selectedPlayer: LocalId | undefined;
  setSelectedPlayer: SelectPlayer;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(100);
  const { worldState, getPlayerState } = useLocalWorld();

  useEffect(() => {
    setMounted(true);
  }, []);

  const worldWidth = Math.max(1, worldState.world.width);
  const worldHeight = Math.max(1, worldState.world.height);
  const players = mounted
    ? worldState.players
        .map((player) => {
          const state = getPlayerState(player._id);
          if (!state) return null;
          const position = positionForDisplay(state);
          return { player, state, position };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  const zoomIn = () => setZoom((value) => Math.min(140, value + 10));
  const zoomOut = () => setZoom((value) => Math.max(70, value - 10));
  const resetZoom = () => setZoom(100);

  const isEmpty = mounted && players.length === 0;

  return (
    <div className="relative flex h-full min-h-[360px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {isEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-50 px-6 text-center">
          <div className="max-w-xs">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-600">No agents working right now</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Start a session in Claude, Codex, or Cursor and it will appear on the floor here.
            </p>
          </div>
        </div>
      )}
      <div
        className={clsx(
          'absolute right-4 top-4 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur',
          isEmpty && 'hidden',
        )}
      >
        <button
          type="button"
          onClick={zoomOut}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="min-w-[3rem] rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
        >
          {zoom}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      <div className="relative isolate min-h-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0 origin-center transition-transform duration-200"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-80"
            style={{
              backgroundImage:
                'linear-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.14) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
            }}
          />

          {worldState.teams.length > 0 &&
            worldState.teams.map((team) => {
              const left = ((team.center.x - 3) / worldWidth) * 100;
              const top = ((team.center.y - 2) / worldHeight) * 100;
              const width = (6 / worldWidth) * 100;
              const height = (4.2 / worldHeight) * 100;
              return (
                <div
                  key={team.id}
                  className={clsx(
                    'absolute z-0 rounded-lg border border-dashed p-2 text-xs font-medium',
                    sourceTone(team.source),
                  )}
                  style={{
                    left: clampPercent(left),
                    top: clampPercent(top),
                    width: clampPercent(width),
                    height: clampPercent(height),
                    minWidth: 112,
                    minHeight: 76,
                  }}
                >
                  <div className="rounded-md bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] shadow-sm">
                    {team.name}
                  </div>
                </div>
              );
            })}

          {players.map(({ player, state, position }) => {
            const selected = selectedPlayer === state.id;
            const source = state.projectSessions?.[0]?.source ?? 'claude';
            const running = state.thinking || state.motion.type === 'walking';
            const statusTone = running
              ? 'bg-emerald-500'
              : state.sleeping
                ? 'bg-slate-300'
                : 'bg-amber-400';
            return (
              <button
                key={player._id}
                type="button"
                onClick={() => setSelectedPlayer(state.id)}
                className={clsx(
                  'group absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
                  selected ? 'z-20 border-slate-900 ring-2 ring-slate-300' : 'border-white',
                )}
                style={{
                  left: clampPercent(((position.x + 0.5) / worldWidth) * 100),
                  top: clampPercent(((position.y + 0.5) / worldHeight) * 100),
                }}
                aria-pressed={selected}
                title={`${state.name} · ${source}`}
              >
                <span
                  className={clsx(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold',
                    selected ? 'border-slate-900 bg-slate-950 text-white' : sourceTone(source),
                  )}
                  aria-hidden="true"
                >
                  {initialsFor(state.name)}
                </span>
                <span className="sr-only">{state.name}</span>
                <span
                  className={clsx(
                    'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white',
                    statusTone,
                    running && 'animate-pulse',
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
