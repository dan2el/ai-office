'use client';

// Based on https://codepen.io/inlet/pen/yLVmPWv.
// Copyright (c) 2018 Patrick Brouwer, distributed under the MIT license.

import { PixiComponent, useApp } from '@pixi/react';
import { Viewport } from 'pixi-viewport';

const PixiViewportComponent = PixiComponent('Viewport', {
  create(props) {
    const { app, ...viewportProps } = props;

    const viewport = new Viewport({
      events: app.renderer.events,
      passiveWheel: false,
      ...viewportProps,
    });

    // Activate plugins
    viewport
      .drag()
      .pinch({})
      .wheel()
      .decelerate()
      .clamp({ direction: 'all', underflow: 'center' })
      .clampZoom({
        minWidth: 50,
        maxWidth: viewportProps.worldWidth ?? 800,
      });

    // Start fully zoomed out so the whole office fits on screen.
    if (viewportProps.worldWidth && viewportProps.screenWidth) {
      viewport.fit();
      viewport.moveCenter(viewportProps.worldWidth / 2, viewportProps.worldHeight / 2);
    }

    return viewport;
  },
  applyProps(viewport, oldProps, newProps) {
    Object.keys(newProps).forEach((p) => {
      if (p !== 'children' && oldProps[p] !== newProps[p]) {
        // @ts-expect-error Ignoring TypeScript here
        viewport[p] = newProps[p];
      }
    });
  },
});

export default function PixiViewport(props: React.ComponentProps<typeof PixiViewportComponent>) {
  const app = useApp();
  return <PixiViewportComponent app={app} {...props} />;
}
