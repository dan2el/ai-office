'use client';
import clsx from 'clsx';
import { SelectPlayer } from './Player';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId, LocalPlayerDoc } from '@/lib/localWorld';

const buttonAssetNames = new Set([
  'Angela',
  'Dwight',
  'Jim',
  'Kevin',
  'Michael',
  'Pam',
  'Stanley',
  'Toby',
]);

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
  const { getCharacter, getPlayerState } = useLocalWorld();
  const playerState = getPlayerState(player._id);
  const character = playerState ? getCharacter(playerState.characterId) : undefined;
  const name = playerState?.name ?? player.name;
  const avatarSrc =
    character && buttonAssetNames.has(character.name)
      ? `/assets/${character.name}_button.svg`
      : null;
  const selected = selectedPlayer === playerState?.id;
  const handleClick = () => {
    if (playerState) {
      selectPlayer(playerState.id);
    }
  };

  return (
    <button
      type="button"
      className="button block w-full min-w-0 overflow-hidden pointer-events-auto text-left text-base text-white shadow-solid sm:text-lg"
      onClick={handleClick}
      disabled={!playerState}
      title={name}
      aria-pressed={selected}
    >
      <div
        className={clsx(
          'min-w-0 overflow-hidden px-2 py-1',
          selected ? 'bg-brown-500' : 'bg-clay-700',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {avatarSrc ? (
            <img
              className="h-8 w-8 shrink-0"
              src={avatarSrc}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center bg-brown-900 text-xs uppercase text-silver"
              aria-hidden="true"
            >
              {initialsFor(name)}
            </div>
          )}
          <div className="min-w-0 flex-1 truncate">{name}</div>
        </div>
      </div>
    </button>
  );
}
