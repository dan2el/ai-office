import { Stage } from '@pixi/react';
import { RefObject, useRef } from 'react';
import { PixiStaticMap } from './PixiStaticMap';
import { Player, SelectPlayer } from './Player';
import dynamic from 'next/dynamic';
import { Viewport } from 'next/dist/lib/metadata/types/extra-types';
import { createContext } from 'react';
import { useLocalWorld } from './LocalWorldProvider';

export const ViewportContext = createContext<RefObject<Viewport> | null>(null);

// Disabling SSR for these since they don't work server side.
const PixiViewport = dynamic(() => import('./PixiViewport'), { ssr: false });
const Sound = dynamic(() => import('./Sound'), { ssr: false });

export const Game = ({
  setSelectedPlayer,
  width,
  height,
}: {
  setSelectedPlayer: SelectPlayer;
  width: number;
  height: number;
}) => {
  const { getCharacter, getPlayerState, worldState } = useLocalWorld();
  const viewportRef = useRef<Viewport>(null);
  const offset = 0;
  const { players } = worldState;

  return (
    <ViewportContext.Provider value={viewportRef}>

    <div className="container">
      <Sound>
        <Stage width={width} height={height} options={{ backgroundColor: 0x000000 }}>
          <PixiViewport
            screenWidth={width}
            screenHeight={height}
            worldWidth={worldState.map.tileSetDim}
            worldHeight={worldState.map.tileSetDim}
          >
            <PixiStaticMap map={worldState.map}></PixiStaticMap>
            {players.map((player) => {
              const playerState = getPlayerState(player._id);
              const character = getCharacter(player.characterId);
              if (!playerState || !character) return null;
              return (
                <Player
                  key={player._id}
                  playerState={playerState}
                  character={character}
                  offset={offset}
                  tileDim={worldState.map.tileDim}
                  onClick={setSelectedPlayer}
                />
              );
            })}
          </PixiViewport>
        </Stage>
      </Sound>
    </div>
     
  </ViewportContext.Provider>
  );

};
export default Game;
