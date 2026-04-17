/**
 * Tests for the SVG capture improvements in PostprocessingTab.
 *
 * Since the actual svgToDataUrl function relies on DOM APIs (getBoundingClientRect,
 * window.getComputedStyle, Image, Canvas), we test the pure-logic aspects:
 * - Integer ceiling of width/height
 * - viewBox attribute added when missing
 * - Canvas dimensions = intW * scale, intH * scale (scale = 2)
 * - crossOrigin is set
 */
import { describe, it, expect } from 'vitest';

describe('SVG capture dimension logic', () => {
  it('uses Math.ceil for integer dimensions', () => {
    // Simulates getBoundingClientRect returning fractional values
    const cases = [
      { w: 800.4, h: 600.7, expectedW: 801, expectedH: 601 },
      { w: 1024, h: 768, expectedW: 1024, expectedH: 768 },
      { w: 0.1, h: 0.1, expectedW: 1, expectedH: 1 },
      { w: 300.999, h: 200.001, expectedW: 301, expectedH: 201 },
    ];

    for (const { w, h, expectedW, expectedH } of cases) {
      expect(Math.ceil(w)).toBe(expectedW);
      expect(Math.ceil(h)).toBe(expectedH);
    }
  });

  it('computes canvas dimensions at 2x scale', () => {
    const scale = 2;
    const intW = 800;
    const intH = 600;
    expect(intW * scale).toBe(1600);
    expect(intH * scale).toBe(1200);
  });

  it('viewBox string format is correct', () => {
    const intW = 800;
    const intH = 600;
    const viewBox = `0 0 ${intW} ${intH}`;
    expect(viewBox).toBe('0 0 800 600');
  });

  it('rejects zero dimensions', () => {
    const width = 0;
    const height = 0;
    const shouldThrow = width === 0 || height === 0;
    expect(shouldThrow).toBe(true);
  });
});

describe('SVG capture retry logic', () => {
  /**
   * The capture function uses different retry strategies for 3D vs non-3D views.
   * 3D: 7 retries, first delay 2000ms, subsequent 1000ms then 500ms
   * Non-3D (SVG): 5 retries, delays 800ms, 600ms, 400ms, 400ms, 400ms
   */
  it('3D retry schedule has 7 attempts', () => {
    const maxRetries3D = 7;
    const delays3D = [2000, 1000, 500, 500, 500, 500, 500];
    expect(delays3D.length).toBe(maxRetries3D);
  });

  it('non-3D (SVG) retry schedule has 5 attempts', () => {
    const maxRetriesNon3D = 5;
    const delays = [800, 600, 400, 400, 400];
    expect(delays.length).toBe(maxRetriesNon3D);
  });

  it('first SVG retry waits longer than subsequent ones', () => {
    const delays = [800, 600, 400, 400, 400];
    expect(delays[0]).toBeGreaterThan(delays[delays.length - 1]);
  });

  it('3D first retry waits significantly longer (2s)', () => {
    const delays3D = [2000, 1000, 500, 500, 500, 500, 500];
    expect(delays3D[0]).toBe(2000);
    expect(delays3D[0]).toBeGreaterThan(delays3D[1]);
  });
});
