/**
 * Tests for canvas utility functions (pure math).
 */

import { describe, it, expect } from 'vitest'
import { canvasToWorld, worldToCanvas, computeGridSpacing } from './canvasUtils'

describe('canvasToWorld', () => {
  it('returns origin when pixel is at canvas center with no offset', () => {
    const [wx, wy] = canvasToWorld(400, 300, { x: 0, y: 0 }, 100, 800, 600)
    expect(wx).toBeCloseTo(0)
    expect(wy).toBeCloseTo(0)
  })

  it('converts top-left corner correctly', () => {
    // pixel (0, 0) with canvasW=800, canvasH=600, zoom=100, offset=0
    const [wx, wy] = canvasToWorld(0, 0, { x: 0, y: 0 }, 100, 800, 600)
    expect(wx).toBeCloseTo(-4) // (0 - 400) / 100 = -4
    expect(wy).toBeCloseTo(3) // -(0 - 300) / 100 = 3
  })

  it('applies offset correctly', () => {
    const [wx, wy] = canvasToWorld(400, 300, { x: 5, y: 10 }, 100, 800, 600)
    expect(wx).toBeCloseTo(5)
    expect(wy).toBeCloseTo(10)
  })

  it('applies zoom correctly', () => {
    const [wx, wy] = canvasToWorld(500, 200, { x: 0, y: 0 }, 200, 800, 600)
    // (500-400)/200 = 0.5, -(200-300)/200 = 0.5
    expect(wx).toBeCloseTo(0.5)
    expect(wy).toBeCloseTo(0.5)
  })
})

describe('worldToCanvas', () => {
  it('returns canvas center for world origin with no offset', () => {
    const [px, py] = worldToCanvas(0, 0, { x: 0, y: 0 }, 100, 800, 600)
    expect(px).toBeCloseTo(400)
    expect(py).toBeCloseTo(300)
  })

  it('is inverse of canvasToWorld', () => {
    const offset = { x: 2, y: -3 }
    const zoom = 150
    const canvasW = 1024
    const canvasH = 768

    const [wx, wy] = canvasToWorld(300, 200, offset, zoom, canvasW, canvasH)
    const [px, py] = worldToCanvas(wx, wy, offset, zoom, canvasW, canvasH)
    expect(px).toBeCloseTo(300)
    expect(py).toBeCloseTo(200)
  })

  it('maps positive world x to right of center', () => {
    const [px] = worldToCanvas(1, 0, { x: 0, y: 0 }, 100, 800, 600)
    expect(px).toBe(500) // 1 * 100 + 400
  })

  it('maps positive world y to above center (lower pixel y)', () => {
    const [, py] = worldToCanvas(0, 1, { x: 0, y: 0 }, 100, 800, 600)
    expect(py).toBe(200) // -(1) * 100 + 300
  })
})

describe('computeGridSpacing', () => {
  it('returns a power-of-10-based spacing', () => {
    const spacing = computeGridSpacing(100)
    expect(spacing).toBeGreaterThan(0)
    // Check it's a "nice" number: 1, 2, 5, 10, 20, 50, ...
    const mantissa = spacing / Math.pow(10, Math.floor(Math.log10(spacing)))
    expect([1, 2, 5, 10]).toContain(Math.round(mantissa))
  })

  it('increases spacing at lower zoom', () => {
    const spacingLow = computeGridSpacing(10)
    const spacingHigh = computeGridSpacing(1000)
    expect(spacingLow).toBeGreaterThan(spacingHigh)
  })

  it('returns 1 at zoom=50', () => {
    // rawSpacing = 50/50 = 1, magnitude=1, ratio=1 → spacing=1
    expect(computeGridSpacing(50)).toBe(1)
  })
})
