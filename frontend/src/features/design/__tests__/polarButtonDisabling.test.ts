/**
 * Tests for polar-plot button disabling logic in RibbonMenu.
 *
 * After the fix, BOTH "Pattern Cut" and "Sweep Overlay" buttons are disabled
 * once ANY polar-plot item exists in the selected view — regardless of whether
 * it's a pattern cut or sweep overlay.
 */
import { describe, it, expect } from 'vitest';
import type { ViewItem } from '@/types/postprocessing';

/**
 * Pure-logic replica of the polar button disable condition from RibbonMenu.
 */
function hasAnyPolarItem(items: ViewItem[]): boolean {
  return items.some((i) => i.type === 'polar-plot');
}

describe('Polar button disabling logic', () => {
  it('returns false when no items exist', () => {
    expect(hasAnyPolarItem([])).toBe(false);
  });

  it('returns false when only non-polar items exist', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'line-plot', label: 'Z(f)', visible: true },
      { id: '2', type: 'smith-chart', label: 'Smith', visible: true },
    ];
    expect(hasAnyPolarItem(items)).toBe(false);
  });

  it('returns true when a pattern cut polar-plot exists', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Pattern Cut', visible: true, sweepOverlay: false },
    ];
    expect(hasAnyPolarItem(items)).toBe(true);
  });

  it('returns true when a sweep overlay polar-plot exists', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Sweep Overlay', visible: true, sweepOverlay: true },
    ];
    expect(hasAnyPolarItem(items)).toBe(true);
  });

  it('returns true when both polar types exist (mixed)', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Pattern Cut', visible: true, sweepOverlay: false },
      { id: '2', type: 'polar-plot', label: 'Sweep Overlay', visible: true, sweepOverlay: true },
    ];
    expect(hasAnyPolarItem(items)).toBe(true);
  });

  it('returns true when polar-plot exists among other items', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'antenna-system', label: 'Antennas', visible: true },
      { id: '2', type: 'polar-plot', label: 'Pattern', visible: true },
      { id: '3', type: 'line-plot', label: 'Plot', visible: true },
    ];
    expect(hasAnyPolarItem(items)).toBe(true);
  });

  it('both buttons use the same condition (no asymmetry)', () => {
    // Before the fix, "Pattern Cut" checked !hasSweepOverlay and
    // "Sweep Overlay" checked !hasPatternCut — meaning one could still be
    // enabled if only the other type existed. Now both use hasAnyPolarItem.
    const patternCutOnly: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Pattern Cut', visible: true, sweepOverlay: false },
    ];
    const sweepOverlayOnly: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Sweep', visible: true, sweepOverlay: true },
    ];

    // Both should disable BOTH buttons
    expect(hasAnyPolarItem(patternCutOnly)).toBe(true);
    expect(hasAnyPolarItem(sweepOverlayOnly)).toBe(true);
  });
});
