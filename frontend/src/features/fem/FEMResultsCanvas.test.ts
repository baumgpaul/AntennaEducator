/**
 * Tests for FEMResultsCanvas drawing helpers — pure function tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  drawFilledContour,
  drawMeshWireframe,
  drawVectorArrows,
  drawColorBar,
} from './FEMResultsCanvas'
import type { FEMMesh } from '@/types/femMesh'
import type { ScalarFieldResult, VectorFieldResult } from '@/types/femSolver'

// Minimal mock mesh
function createMockMesh(): FEMMesh {
  return {
    dimension: 2,
    nodes: [
      { id: 0, coords: [0, 0] },
      { id: 1, coords: [1, 0] },
      { id: 2, coords: [0.5, 1] },
      { id: 3, coords: [1, 1] },
    ],
    elements: [
      { id: 0, elementType: 'tri3', nodeIds: [0, 1, 2], regionId: 0 },
      { id: 1, elementType: 'tri3', nodeIds: [1, 3, 2], regionId: 0 },
    ],
    regions: [{ id: 0, name: 'domain', materialId: null }],
    boundaryEdges: [],
    elementType: 'tri3',
    metadata: {},
  }
}

function createMockScalarField(): ScalarFieldResult {
  return {
    name: 'potential',
    values: [0, 1, 0.5, 1],
    unit: 'V',
    min: 0,
    max: 1,
  }
}

function createMockVectorField(): VectorFieldResult {
  return {
    name: 'e_field',
    values: [[1, 0], [0, 1], [0.5, 0.5], [1, 1]],
    unit: 'V/m',
    maxMagnitude: Math.sqrt(2),
  }
}

function createMockContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
  } as unknown as CanvasRenderingContext2D
}

describe('drawFilledContour', () => {
  it('draws triangles for each mesh element', () => {
    const ctx = createMockContext()
    const mesh = createMockMesh()
    const field = createMockScalarField()

    drawFilledContour(ctx, mesh, field, 'viridis', { x: 0.5, y: 0.5 }, 100, 800, 600)

    // Should call fill() once per element (2 triangles)
    expect(ctx.fill).toHaveBeenCalledTimes(2)
    expect(ctx.beginPath).toHaveBeenCalled()
    expect(ctx.closePath).toHaveBeenCalled()
  })

  it('handles empty mesh gracefully', () => {
    const ctx = createMockContext()
    const mesh: FEMMesh = { ...createMockMesh(), elements: [] }
    const field = createMockScalarField()

    drawFilledContour(ctx, mesh, field, 'viridis', { x: 0, y: 0 }, 100, 800, 600)
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('uses custom color range when provided', () => {
    const ctx = createMockContext()
    const mesh = createMockMesh()
    const field = createMockScalarField()

    // Should not throw with custom range
    drawFilledContour(ctx, mesh, field, 'jet', { x: 0.5, y: 0.5 }, 100, 800, 600, [0.2, 0.8])
    expect(ctx.fill).toHaveBeenCalledTimes(2)
  })
})

describe('drawMeshWireframe', () => {
  it('draws wireframe edges for each element', () => {
    const ctx = createMockContext()
    const mesh = createMockMesh()

    drawMeshWireframe(ctx, mesh, { x: 0.5, y: 0.5 }, 100, 800, 600)

    // Should stroke each element (2 triangles)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
  })
})

describe('drawVectorArrows', () => {
  it('draws arrows at element centers', () => {
    const ctx = createMockContext()
    const mesh = createMockMesh()
    const vectorField = createMockVectorField()

    drawVectorArrows(ctx, mesh, vectorField, { x: 0.5, y: 0.5 }, 100, 800, 600, 1.0)

    // Should draw lines for arrows (shaft + arrowhead per element)
    expect(ctx.stroke).toHaveBeenCalled()
  })

  it('handles empty vector field', () => {
    const ctx = createMockContext()
    const mesh = createMockMesh()
    const vectorField: VectorFieldResult = {
      name: 'e_field',
      values: [],
      unit: 'V/m',
      maxMagnitude: 0,
    }

    drawVectorArrows(ctx, mesh, vectorField, { x: 0, y: 0 }, 100, 800, 600, 1.0)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('drawColorBar', () => {
  it('draws gradient rectangles and labels', () => {
    const ctx = createMockContext()

    drawColorBar(ctx, 'viridis', 0, 100, 'V', 800, 600)

    // Should draw many small rects for gradient + border rect
    expect(ctx.fillRect).toHaveBeenCalled()
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1)

    // Should draw at least 3 labels (min, mid, max)
    expect(ctx.fillText).toHaveBeenCalled()
    const fillTextCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls
    expect(fillTextCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('includes unit label when provided', () => {
    const ctx = createMockContext()

    drawColorBar(ctx, 'jet', 0, 1, 'V/m', 800, 600)

    const fillTextCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls
    const hasUnit = fillTextCalls.some(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('V/m'),
    )
    expect(hasUnit).toBe(true)
  })
})
