/**
 * Tests for evaluateGeometry — converts GeoOperation[] to EvaluatedGeometry.
 */

import { describe, it, expect } from 'vitest'
import { evaluateGeometry } from './evaluateGeometry'
import { initialNamingCounters } from './femGeometry'
import type { GeoOperation, NamingCounters } from './femGeometry'

const counters: NamingCounters = { ...initialNamingCounters }

describe('evaluateGeometry', () => {
  describe('rectangle', () => {
    it('creates a surface with 4 line edges', () => {
      const ops: GeoOperation[] = [
        {
          type: 'add_rectangle',
          params: { center_x: 0, center_y: 0, width: 2, height: 1, tag: 'rect_1' },
        },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(1)
      expect(result.surfaces[0].id).toBe('rect_1')
      expect(result.surfaces[0].name).toBe('rect_1')
      expect(result.surfaces[0].primitiveType).toBe('rectangle')
      expect(result.surfaces[0].edgeIds).toHaveLength(4)

      expect(result.edges).toHaveLength(4)
      expect(result.edges[0].parentSurfaceId).toBe('rect_1')
      expect(result.edges[0].edgeType).toBe('line')
      // Auto-descriptive names
      expect(result.edges[0].name).toBe('rect_1_bottom')
      expect(result.edges[1].name).toBe('rect_1_right')
      expect(result.edges[2].name).toBe('rect_1_top')
      expect(result.edges[3].name).toBe('rect_1_left')

      // bodies alias
      expect(result.bodies).toEqual(result.surfaces)
    })
  })

  describe('circle', () => {
    it('creates a surface with 1 arc edge', () => {
      const ops: GeoOperation[] = [
        {
          type: 'add_circle',
          params: { center_x: 0, center_y: 0, radius: 1, tag: 'circle_1' },
        },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(1)
      expect(result.surfaces[0].primitiveType).toBe('circle')
      expect(result.surfaces[0].edgeIds).toHaveLength(1)

      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].name).toBe('circle_1_arc')
      expect(result.edges[0].edgeType).toBe('arc')
      expect(result.edges[0].parentSurfaceId).toBe('circle_1')
    })
  })

  describe('ellipse', () => {
    it('creates a surface with 1 arc edge', () => {
      const ops: GeoOperation[] = [
        {
          type: 'add_ellipse',
          params: { center_x: 0, center_y: 0, semi_axis_a: 2, semi_axis_b: 1, tag: 'ellipse_1' },
        },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(1)
      expect(result.surfaces[0].primitiveType).toBe('ellipse')
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].name).toBe('ellipse_1_arc')
    })
  })

  describe('polygon', () => {
    it('creates a surface with n line edges', () => {
      const ops: GeoOperation[] = [
        {
          type: 'add_polygon',
          params: {
            vertices: [[0, 0], [1, 0], [0.5, 1]],
            tag: 'tri_1',
          },
        },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(1)
      expect(result.surfaces[0].primitiveType).toBe('polygon')
      expect(result.surfaces[0].edgeIds).toHaveLength(3)

      expect(result.edges).toHaveLength(3)
      expect(result.edges[0].name).toBe('tri_1_edge1')
      expect(result.edges[1].name).toBe('tri_1_edge2')
      expect(result.edges[2].name).toBe('tri_1_edge3')
    })
  })

  describe('standalone elements', () => {
    it('adds standalone line edge (no parent surface)', () => {
      const ops: GeoOperation[] = [
        {
          type: 'add_line',
          params: { start_x: 0, start_y: 0, end_x: 1, end_y: 1, tag: 'line_1' },
        },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(0)
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].id).toBe('line_1')
      expect(result.edges[0].parentSurfaceId).toBeNull()
    })

    it('adds point', () => {
      const ops: GeoOperation[] = [
        { type: 'add_point', params: { x: 1, y: 2, tag: 'pt_1' } },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.points).toHaveLength(1)
      expect(result.points[0].id).toBe('pt_1')
    })
  })

  describe('multiple operations', () => {
    it('evaluates all operations in sequence', () => {
      const ops: GeoOperation[] = [
        { type: 'add_rectangle', params: { x: 0, y: 0, width: 1, height: 1, tag: 'rect_1' } },
        { type: 'add_circle', params: { center_x: 3, center_y: 0, radius: 0.5, tag: 'circle_1' } },
        { type: 'add_line', params: { start_x: 0, start_y: 0, end_x: 3, end_y: 0, tag: 'wire_1' } },
      ]
      const result = evaluateGeometry(ops, counters)

      expect(result.surfaces).toHaveLength(2)
      expect(result.edges).toHaveLength(6) // 4 rect edges + 1 circle arc + 1 standalone line
      expect(result.edges.filter((e) => e.parentSurfaceId === 'rect_1')).toHaveLength(4)
      expect(result.edges.filter((e) => e.parentSurfaceId === 'circle_1')).toHaveLength(1)
      expect(result.edges.filter((e) => e.parentSurfaceId === null)).toHaveLength(1)
    })
  })

  describe('boolean operations', () => {
    it('subtract with remove_tool removes tool surface but keeps inner edges as children', () => {
      const ops: GeoOperation[] = [
        { type: 'add_rectangle', params: { x: 0, y: 0, width: 2, height: 1, tag: 'rect_1' } },
        { type: 'add_circle', params: { cx: 1, cy: 0.5, radius: 0.3, tag: 'hole' } },
        { type: 'boolean_subtract', params: { object_tag: 'rect_1', tool_tag: 'hole', tag: 'plate_with_hole' } },
      ]
      const result = evaluateGeometry(ops, counters)

      // Tool removed (default): only the result surface remains
      expect(result.surfaces).toHaveLength(1)
      expect(result.surfaces[0].id).toBe('plate_with_hole')
      expect(result.surfaces[0].name).toBe('Subtract(rect_1, hole)')
      expect(result.surfaces[0].primitiveType).toBe('boolean_result')
      // All edges (outer + inner) in edgeIds, no innerLoops
      expect(result.surfaces[0].edgeIds).toHaveLength(5)
      expect(result.surfaces[0].innerLoops).toHaveLength(0)
      // 4 rect edges + 1 inner edge (independent copy); original tool edge removed
      expect(result.edges).toHaveLength(5)
      // Inner edge is owned by result (independent copy)
      const innerEdgeId = result.surfaces[0].edgeIds.find((id) => id.includes('hole'))
      expect(innerEdgeId).toBeDefined()
      const innerEdge = result.edges.find((e) => e.id === innerEdgeId)
      expect(innerEdge).toBeDefined()
      expect(innerEdge!.parentSurfaceId).toBe('plate_with_hole')
    })

    it('subtract with remove_tool=false keeps tool surface and creates independent inner edges as children', () => {
      const ops: GeoOperation[] = [
        { type: 'add_rectangle', params: { x: 0, y: 0, width: 2, height: 1, tag: 'rect_1' } },
        { type: 'add_circle', params: { cx: 1, cy: 0.5, radius: 0.3, tag: 'hole' } },
        { type: 'boolean_subtract', params: { object_tag: 'rect_1', tool_tag: 'hole', tag: 'result', remove_tool: false } },
      ]
      const result = evaluateGeometry(ops, counters)

      // Tool surface kept: result + hole
      expect(result.surfaces).toHaveLength(2)
      expect(result.surfaces[0].id).toBe('hole')
      expect(result.surfaces[1].id).toBe('result')
      expect(result.surfaces[1].primitiveType).toBe('boolean_result')
      // Inner edges appear in edgeIds alongside outer edges, no innerLoops
      expect(result.surfaces[1].edgeIds).toHaveLength(5)
      expect(result.surfaces[1].innerLoops).toHaveLength(0)
      // 4 rect edges + 1 original tool edge + 1 inner copy = 6 edges
      expect(result.edges).toHaveLength(6)
      // Inner edge is a copy, not the same ID as the tool's edge
      const innerEdgeId = result.surfaces[1].edgeIds.find((id) => id.includes('hole'))
      expect(innerEdgeId).toBeDefined()
      expect(innerEdgeId).not.toBe('hole_e0')
      expect(innerEdgeId).toContain('result_hole_')
    })
  })

  describe('empty operations', () => {
    it('returns empty geometry for no operations', () => {
      const result = evaluateGeometry([], counters)
      expect(result.surfaces).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
      expect(result.points).toHaveLength(0)
    })
  })
})
