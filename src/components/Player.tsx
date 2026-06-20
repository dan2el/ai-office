import { useTick } from '@pixi/react';
import { useEffect, useRef, useState } from 'react';
import {
  LocalCharacter,
  LocalId,
  LocalPlayerState,
  Pose,
  getPoseFromMotion,
} from '@/lib/localWorld';
import { Character } from './Character';

const SpeechDurationMs = 2000;
const SpokeRecentlyMs = 5_000;

export type SelectPlayer = (playerId: LocalId) => void;

export const Player = ({
  playerState,
  character,
  offset,
  tileDim,
  onClick,
}: {
  playerState: LocalPlayerState;
  character: LocalCharacter;
  offset: number;
  tileDim: number;
  onClick: SelectPlayer;
}) => {
  const [pose, setPose] = useState<Pose>(() => getPoseFromMotion(playerState.motion, Date.now() + offset));
  const time = useRef(0);
  const [hasTicked, setHasTicked] = useState(false);
  useTick(() => {
    time.current = Date.now() + offset;
    if (!playerState) return;
    if (!time.current) return;
    const pose = getPoseFromMotion(playerState.motion, time.current);
    setPose(pose);
    setHasTicked(true);
  });
  useEffect(() => {
    if (hasTicked) return;
    setPose(getPoseFromMotion(playerState.motion, Date.now() + offset));
  }, [hasTicked, offset, playerState.motion]);
  if (!playerState || !character) return null;
  if (!pose) return null;
  const baseX = pose.position.x * tileDim + tileDim / 2;
  const baseY = pose.position.y * tileDim + tileDim / 2;
  return (
    <>
      <Character
        x={baseX}
        y={baseY}
        orientation={pose.orientation}
        isMoving={
          playerState.motion.type === 'walking' && playerState.motion.targetEndTs >= time.current
        }
        isThinking={
          playerState.thinking &&
          (playerState.lastChat?.message.ts ?? 0) < time.current - SpokeRecentlyMs
        }
        isSpeaking={
          playerState.lastChat?.message.type === 'responded' &&
          (playerState.lastChat.message.ts ?? 0) > time.current - SpeechDurationMs
        }
        isSleeping={playerState.sleeping ?? false}
        scaleFactor={playerState.isSubagent ? 0.72 : 1}
        textureUrl={character.textureUrl}
        spritesheetData={character.spritesheetData}
        speed={character.speed}
        onClick={() => {
          onClick(playerState.id);
        }}
      />
    </>
  );
};
