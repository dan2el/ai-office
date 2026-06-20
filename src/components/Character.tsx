import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef } from 'react';
import { AnimatedSprite, Container, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  isSleeping = false,
  speed = 0.1,
  scaleFactor = 1,
  onClick,
}: {
  // Path to the texture packed image.
  textureUrl: string;
  // The data for the spritesheet.
  spritesheetData: ISpritesheetData;
  // The pose of the NPC.
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  // Shows a thought bubble if true.
  isThinking?: boolean;
  // Shows a speech bubble if true.
  isSpeaking?: boolean;
  // Shows a sleep bubble if true (idle sessions resting).
  isSleeping?: boolean;
  // The speed of the animation. Can be tuned depending on the side and speed of the NPC.
  speed?: number;
  // Sprite scale multiplier — subagents render a bit smaller than leads.
  scaleFactor?: number;
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  const [isTextureUnavailable, setIsTextureUnavailable] = useState(false);
  useEffect(() => {
    let isCancelled = false;
    const parseSheet = async () => {
      try {
        const textureCheck = await fetch(textureUrl, { method: 'HEAD' }).catch(() => null);
        if (!textureCheck?.ok) {
          throw new Error(`Character texture not available: ${textureUrl}`);
        }

        const sheet = new Spritesheet(
          BaseTexture.from(textureUrl, {
            scaleMode: PIXI.SCALE_MODES.NEAREST,
          }),
          spritesheetData,
        );
        await sheet.parse();
        if (!isCancelled) {
          setSpriteSheet(sheet);
          setIsTextureUnavailable(false);
        }
      } catch {
        if (!isCancelled) {
          setSpriteSheet(undefined);
          setIsTextureUnavailable(true);
        }
      }
    };
    void parseSheet();
    return () => {
      isCancelled = true;
    };
  }, [textureUrl, spritesheetData]);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.round(orientation / 90);
  const direction = ['left', 'up', 'left', 'down'][roundedOrientation];

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet && !isTextureUnavailable) return null;

  return (
    <Container x={x} y={y} interactive={true} pointerdown={onClick}>
      {isThinking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSleeping && (
        <Text x={16} y={-12} scale={0.8} text={'💤'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {spriteSheet ? (
        <AnimatedSprite
          ref={ref}
          isPlaying={isMoving}
          textures={spriteSheet.animations[direction]}
          animationSpeed={speed}
          // If the orientation is 90 (facing right), we need to flip the sprite.
          scale={
            roundedOrientation === 0
              ? { x: -scaleFactor, y: scaleFactor }
              : { x: scaleFactor, y: scaleFactor }
          }
          anchor={{ x: 0.5, y: 0.5 }}
        />
      ) : (
        <Text
          text={'🙂'}
          anchor={{ x: 0.5, y: 0.5 }}
          scale={{ x: scaleFactor, y: scaleFactor }}
        />
      )}
    </Container>
  );
};
