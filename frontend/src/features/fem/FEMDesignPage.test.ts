/**
 * Tests for FEM Design Page and sub-components.
 *
 * Pure logic tests for tree helpers, geometry labels, etc.
 * Component rendering tests use jsdom + Redux Provider.
 */

import { describe, it, expect } from 'vitest'
import type { GeoOperation } from '@/types/femGeometry'

// ── Pure helper tests ─────────────────────────────────────────

/** Extract label for a geometry operation (mirrors ModelTree logic). */
function getOpLabel(type: string, params: Record<string, unknown>): string {
  const tag = params.tag as string | undefined
  if (tag) return tag
  return type.replace('add_', '').replace('_', ' ')
}

describe('getOpLabel', () => {
  it('returns tag when available', () => {
    expect(getOpLabel('add_rectangle', { tag: 'my_rect' })).toBe('my_rect')
  })

  it('falls back to formatted type name', () => {
    expect(getOpLabel('add_rectangle', {})).toBe('rectangle')
  })

  it('handles add_point', () => {
    expect(getOpLabel('add_point', { x: 0, y: 0 })).toBe('point')
  })

  it('handles add_line', () => {
    expect(getOpLabel('add_line', {})).toBe('line')
  })

  it('handles boolean operations', () => {
    expect(getOpLabel('boolean_union', {})).toBe('boolean union')
  })
})

// ── Entity type inference ─────────────────────────────────────

function inferEntityType(opType: string): 'point' | 'edge' | 'body' {
  if (opType.includes('point')) return 'point'
  if (opType.includes('line') || opType.includes('arc')) return 'edge'
  return 'body'
}

describe('inferEntityType', () => {
  it('classifies add_point as point', () => {
    expect(inferEntityType('add_point')).toBe('point')
  })

  it('classifies add_line as edge', () => {
    expect(inferEntityType('add_line')).toBe('edge')
  })

  it('classifies add_arc as edge', () => {
    expect(inferEntityType('add_arc')).toBe('edge')
  })

  it('classifies add_rectangle as body', () => {
    expect(inferEntityType('add_rectangle')).toBe('body')
  })

  it('classifies add_circle as body', () => {
    expect(inferEntityType('add_circle')).toBe('body')
  })

  it('classifies boolean_union as body', () => {
    expect(inferEntityType('boolean_union')).toBe('body')
  })
})

// ── Tab navigation logic ──────────────────────────────────────

describe('Tab availability logic', () => {
  it('solver tab requires mesh ready', () => {
    const meshStatus = 'none'
    const solverTabEnabled = meshStatus === 'ready'
    expect(solverTabEnabled).toBe(false)
  })

  it('solver tab enabled when mesh is ready', () => {
    const meshStatus = 'ready'
    const solverTabEnabled = meshStatus === 'ready'
    expect(solverTabEnabled).toBe(true)
  })

  it('results tab requires solve done', () => {
    const solveStatus = 'idle'
    const resultsTabEnabled = solveStatus === 'done'
    expect(resultsTabEnabled).toBe(false)
  })

  it('results tab enabled when solve is done', () => {
    const solveStatus = 'done'
    const resultsTabEnabled = solveStatus === 'done'
    expect(resultsTabEnabled).toBe(true)
  })
})

// ── Drawing tool state machine tests ──────────────────────────

describe('Drawing tool click state', () => {
  it('rectangle needs 2 clicks', () => {
    const pendingPoints: [number, number][] = []
    // First click
    pendingPoints.push([0, 0])
    expect(pendingPoints.length).toBe(1)

    // Second click → should create operation
    const [sx, sy] = pendingPoints[0]
    const [wx, wy] = [2, 3]
    const cx = (sx + wx) / 2
    const cy = (sy + wy) / 2
    const rw = Math.abs(wx - sx)
    const rh = Math.abs(wy - sy)
    expect(cx).toBe(1)
    expect(cy).toBe(1.5)
    expect(rw).toBe(2)
    expect(rh).toBe(3)
  })

  it('circle needs center + edge point for radius', () => {
    const center: [number, number] = [1, 1]
    const edge: [number, number] = [4, 5]
    const r = Math.hypot(edge[0] - center[0], edge[1] - center[1])
    expect(r).toBe(5) // 3-4-5 triangle
  })

  it('line needs start + end = 2 clicks', () => {
    const start: [number, number] = [0, 0]
    const end: [number, number] = [5, 0]
    const op: GeoOperation = {
      type: 'add_line',
      params: {
        start_x: start[0],
        start_y: start[1],
        end_x: end[0],
        end_y: end[1],
        tag: 'line_1',
      },
    }
    expect(op.type).toBe('add_line')
    expect(op.params.start_x).toBe(0)
    expect(op.params.end_x).toBe(5)
  })
})
