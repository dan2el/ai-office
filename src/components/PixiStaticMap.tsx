// --
// Very simple static map pxi component
//
// --

import { PixiComponent, applyDefaultProps } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { useEffect, useState } from 'react';
import { LocalMap } from '@/lib/localWorld';

const StaticMap = PixiComponent('StaticMap', {
  create: ({ map, texture }: { map: LocalMap; texture: PIXI.Texture }) => {
    const numytiles = map.tileSetDim / map.tileDim;
    const bt = texture.baseTexture;
    bt.scaleMode = PIXI.SCALE_MODES.NEAREST;

    const tiles = [];
    for (let x = 0; x < numytiles; x++) {
      for (let y = 0; y < numytiles; y++) {
        tiles[x + y * numytiles] = new PIXI.Texture(
          bt,
          new PIXI.Rectangle(x * map.tileDim, y * map.tileDim, map.tileDim, map.tileDim),
        );
      }
    }
    const screenytiles = map.bgTiles[0].length;
    const screenxtiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();

    // blit bg & object layers of map onto canvas
    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      // Add all layers of backgrounds.
      for (let z = 0; z < map.bgTiles.length; z++) {
        const tileIndex = map.bgTiles[z][y][x];
        // Some layers may not have tiles at this location.
        if (tileIndex < 0 || !tiles[tileIndex]) continue;
        const ctile = new PIXI.Sprite(tiles[tileIndex]);
        ctile.x = xPx;
        ctile.y = yPx;
        container.addChild(ctile);
      }
      const l1tile = map.objectTiles[y][x];
      if (l1tile >= 0 && tiles[l1tile]) {
        const ctile = new PIXI.Sprite(tiles[l1tile]);
        ctile.x = xPx;
        ctile.y = yPx;
        container.addChild(ctile);
      }
    }

    container.x = 0;
    container.y = 0;

    return container;
  },

  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});

export function PixiStaticMap({ map }: { map: LocalMap }) {
  const [texture, setTexture] = useState<PIXI.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTexture(null);

    void (PIXI.Assets.load(map.tileSetUrl) as Promise<PIXI.Texture>)
      .then((loadedTexture) => {
        if (!cancelled) setTexture(loadedTexture);
      })
      .catch(() => {
        if (!cancelled) setTexture(PIXI.Texture.from(map.tileSetUrl));
      });

    return () => {
      cancelled = true;
    };
  }, [map.tileSetUrl]);

  if (!texture) return null;
  return <StaticMap key={map.tileSetUrl} map={map} texture={texture} />;
}
