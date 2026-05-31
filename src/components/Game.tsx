import { Graphics, Stage, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { RefObject, useMemo, useRef } from 'react';
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
  const teamLabelStyle = useMemo(
    () =>
      new PIXI.TextStyle({
        fontFamily: 'monospace',
        fontSize: 13,
        fill: 0xffffff,
        stroke: 0x1a1118,
        strokeThickness: 4,
      }),
    [],
  );

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
            <Graphics
              draw={(g) => {
                g.clear();
                const t = worldState.map.tileDim;
                worldState.teams.forEach((team) => {
                  const color = team.source === 'codex' ? 0xc08552 : 0x4a8db5;
                  g.beginFill(color, 0.1);
                  g.lineStyle(2, color, 0.45);
                  g.drawRoundedRect(
                    (team.center.x - 2.5) * t,
                    (team.center.y - 1.2) * t,
                    5 * t,
                    4 * t,
                    10,
                  );
                  g.endFill();
                });
              }}
            />
            {worldState.teams.map((team) => (
              <Text
                key={team.id}
                text={team.name}
                x={(team.center.x + 0.5) * worldState.map.tileDim}
                y={(team.center.y - 1.2) * worldState.map.tileDim}
                anchor={{ x: 0.5, y: 1 }}
                style={teamLabelStyle}
              />
            ))}
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
