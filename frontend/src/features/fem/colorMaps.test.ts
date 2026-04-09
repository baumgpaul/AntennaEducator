/**
 * Tests for FEM color map utilities — pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  mapValueToColor,
  normalizeValue,
  rgbToHex,
  rgbToRgba,
  generateColorBarSamples,
} from './colorMaps'
import type { RGB } from './colorMaps'

describe('normalizeValue', () => {
  it('maps min to 0 and max to 1', () => {
    expect(normalizeValue(0, 0, 100)).toBe(0)
    expect(normalizeValue(100, 0, 100)).toBe(1)
  })

  it('maps midpoint to 0.5', () => {
    expect(normalizeValue(50, 0, 100)).toBe(0.5)
  })

  it('returns 0 when min === max (uniform field)', () => {
    expect(normalizeValue(5, 5, 5)).toBe(0)
  })

  it('handles negative ranges', () => {
    expect(normalizeValue(-50, -100, 0)).toBe(0.5)
  })
})

describe('mapValueToColor', () => {
  it('returns start color at t=0 for viridis', () => {
    const color = mapValueToColor(0, 'viridis')
    expect(color).toEqual([68, 1, 84])
  })

  it('returns end color at t=1 for viridis', () => {
    const color = mapValueToColor(1, 'viridis')
    expect(color).toEqual([253, 231, 37])
  })

  it('clamps values below 0', () => {
    const color = mapValueToColor(-0.5, 'viridis')
    expect(color).toEqual([68, 1, 84])
  })

  it('clamps values above 1', () => {
    const color = mapValueToColor(1.5, 'viridis')
    expect(color).toEqual([253, 231, 37])
  })

  it('interpolates at midpoint for viridis', () => {
    const color = mapValueToColor(0.5, 'viridis')
    expect(color).toEqual([33, 145, 140])
  })

  it('works with jet color map', () => {
    const start = mapValueToColor(0, 'jet')
    const end = mapValueToColor(1, 'jet')
    expect(start).toEqual([0, 0, 131])
    expect(end).toEqual([128, 0, 0])
  })

  it('works with coolwarm color map', () => {
    const mid = mapValueToColor(0.5, 'coolwarm')
    expect(mid).toEqual([221, 221, 221])
  })

  it('works with plasma color map', () => {
    expect(mapValueToColor(0, 'plasma')).toEqual([13, 8, 135])
  })

  it('works with inferno color map', () => {
    expect(mapValueToColor(1, 'inferno')).toEqual([252, 255, 164])
  })

  it('returns interpolated value between stops', () => {
    // viridis: t=0.25 → [59,82,139], t=0.5 → [33,145,140]
    // at t=0.375 (midpoint between 0.25 and 0.5):
    const color = mapValueToColor(0.375, 'viridis')
    expect(color[0]).toBeCloseTo(46, 0)
    expect(color[1]).toBeCloseTo(113.5, 0)
    expect(color[2]).toBeCloseTo(139.5, 0)
  })
})

describe('rgbToHex', () => {
  it('converts black', () => {
    expect(rgbToHex([0, 0, 0])).toBe('#000000')
  })

  it('converts white', () => {
    expect(rgbToHex([255, 255, 255])).toBe('#ffffff')
  })

  it('converts a color', () => {
    expect(rgbToHex([68, 1, 84])).toBe('#440154')
  })

  it('clamps out-of-range values', () => {
    expect(rgbToHex([300, -10, 128])).toBe('#ff0080')
  })
})

describe('rgbToRgba', () => {
  it('converts with default alpha', () => {
    expect(rgbToRgba([255, 0, 0])).toBe('rgba(255, 0, 0, 1)')
  })

  it('converts with custom alpha', () => {
    expect(rgbToRgba([0, 128, 255], 0.5)).toBe('rgba(0, 128, 255, 0.5)')
  })
})

describe('generateColorBarSamples', () => {
  it('returns requested number of samples', () => {
    const samples = generateColorBarSamples('viridis', 10)
    expect(samples).toHaveLength(10)
  })

  it('first sample has t=0, last has t=1', () => {
    const samples = generateColorBarSamples('viridis', 10)
    expect(samples[0].t).toBe(0)
    expect(samples[9].t).toBe(1)
  })

  it('each sample has a valid RGB triplet', () => {
    const samples = generateColorBarSamples('jet', 20)
    for (const s of samples) {
      expect(s.color).toHaveLength(3)
      for (const c of s.color) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(255)
      }
    }
  })

  it('samples are monotonically increasing in t', () => {
    const samples = generateColorBarSamples('plasma', 16)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].t).toBeGreaterThan(samples[i - 1].t)
    }
  })
})
