import { describe, expect, it, vi } from 'vitest';
import { compositeSceneWithOverlays, overlayPlacement } from './captureComposite';

describe('overlayPlacement', () => {
  it('maps CSS offsets to canvas pixels at devicePixelRatio 2', () => {
    const p = overlayPlacement(
      { left: 100, top: 50, width: 800, height: 600 },
      1600,
      1200,
      { left: 700, top: 66, width: 120, height: 300 },
    );
    expect(p).toEqual({ x: 1200, y: 32, width: 240, height: 600, scale: 2 });
  });

  it('is the identity at devicePixelRatio 1', () => {
    const p = overlayPlacement(
      { left: 0, top: 0, width: 500, height: 400 },
      500,
      400,
      { left: 364, top: 16, width: 120, height: 280 },
    );
    expect(p).toEqual({ x: 364, y: 16, width: 120, height: 280, scale: 1 });
  });
});

describe('compositeSceneWithOverlays', () => {
  it('returns the scene unchanged when there is no colour scale', async () => {
    const rasterise = vi.fn();
    const url = await compositeSceneWithOverlays(
      'data:image/png;base64,AAA',
      document.createElement('canvas'),
      [],
      rasterise,
    );
    expect(url).toBe('data:image/png;base64,AAA');
    expect(rasterise).not.toHaveBeenCalled();
  });
});
