'use client';
import clsx from 'clsx';
import { SelectPlayer } from './Player';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId, LocalPlayerDoc } from '@/lib/localWorld';

function initialsFor(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
}

export default function PlayerButton(
  { player, 
    selectPlayer,
    selectedPlayer,
  }:{
    player: LocalPlayerDoc;
    selectPlayer: SelectPlayer;
    selectedPlayer: LocalId | undefined;
  }) {
  const { getPlayerState } = useLocalWorld();
  const playerState = getPlayerState(player._id);
  const name = playerState?.name ?? player.name;
  const selected = selectedPlayer === playerState?.id;
  const active = Boolean(playerState?.thinking || playerState?.motion.type === 'walking');
  const sessionCount = playerState?.projectSessions?.length ?? 0;
  const handleClick = () => {
    if (playerState) {
      selectPlayer(playerState.id);
    }
  };

  return (
    <button
      type="button"
      className={clsx(
        'block w-full min-w-0 rounded-lg border bg-white p-3 text-left transition hover:border-teal-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2',
        selected ? 'border-teal-500 shadow-sm ring-2 ring-teal-100' : 'border-slate-200',
        !playerState && 'cursor-not-allowed opacity-60',
      )}
      onClick={handleClick}
      disabled={!playerState}
      title={name}
      aria-pressed={selected}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            selected ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600',
          )}
          aria-hidden="true"
        >
          {initialsFor(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-950">{name}</span>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span
              className={clsx('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-300')}
            />
            {sessionCount > 0 ? `${sessionCount} sessions` : active ? 'Active' : 'Idle'}
          </span>
        </span>
      </div>
    </button>
  );
}
