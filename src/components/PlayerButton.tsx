'use client';
import { SelectPlayer } from './Player';
import { useLocalWorld } from './LocalWorldProvider';
import { LocalId, LocalPlayerDoc } from '@/lib/localWorld';

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
  const handleClick = () => {
    if (playerState) {
      selectPlayer(playerState.id);
    }
  };

  return (
    <>
      <a
        className={`button text-white shadow-solid text-2xl pointer-events-auto ${selectedPlayer === playerState?.id? 'active' : ''}`}
        onClick={handleClick}
        title="Click on a character to see what they have been talking about."
      >
        <div className="inline-block bg-clay-700">
          <span>
            <div className="inline-flex items-center gap-2">
            <img className="w-8 h-8" src={`/assets/${playerState?.name}_button.svg`} />
            {playerState?.name}
            </div>
          </span>
        </div>
      </a>
    </>
  );
}
