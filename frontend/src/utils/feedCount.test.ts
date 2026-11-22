import { describe, expect, it } from 'vitest';
import type { Source } from '@/types/models';
import { countFeeds } from './feedCount';

const v = (node_end: number, amplitude: Source['amplitude']): Source => ({
  type: 'voltage',
  amplitude,
  node_start: 0,
  node_end,
});
const i = (node_start: number, amplitude: Source['amplitude']): Source => ({
  type: 'current',
  amplitude,
  node_start,
});

describe('countFeeds', () => {
  it('is 0 without sources', () => {
    expect(countFeeds([])).toBe(0);
  });

  it('counts a balanced voltage feed (+V / −V at the gap) as one feed', () => {
    expect(countFeeds([v(11, 1), v(12, -1)])).toBe(1);
  });

  it('pairs complex and string amplitudes', () => {
    expect(countFeeds([v(11, { real: 0.5, imag: 0.5 }), v(12, '-0.5-0.5j')])).toBe(1);
  });

  it('counts a balanced current feed as one feed', () => {
    expect(countFeeds([i(11, 0.5), i(12, -0.5)])).toBe(1);
  });

  it('counts a 0 V rod-mode pair as one feed', () => {
    expect(countFeeds([v(11, 0), v(12, 0)])).toBe(1);
  });

  it('keeps two independent feeds of two dipoles apart', () => {
    expect(countFeeds([v(11, 1), v(12, -1), v(31, 1), v(32, -1)])).toBe(2);
  });

  it('does not pair same-sign sources or different types', () => {
    expect(countFeeds([v(11, 1), v(12, 1)])).toBe(2);
    expect(countFeeds([v(11, 1), i(12, -1)])).toBe(2);
  });

  it('does not pair a series source between two nodes', () => {
    const series: Source = { type: 'voltage', amplitude: -1, node_start: 3, node_end: 4 };
    expect(countFeeds([v(11, 1), series])).toBe(2);
  });
});
