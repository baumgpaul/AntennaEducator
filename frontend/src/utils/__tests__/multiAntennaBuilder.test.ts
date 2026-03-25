/**
 * Unit tests for multiAntennaBuilder utility
 */

import { describe, it, expect } from 'vitest'
import {
  buildMultiAntennaRequest,
  convertElementToAntennaInput,
  countSimulationReadyElements,
  validateHasSources,
  getSimulationComplexity,
  extractComplexValue,
} from '../multiAntennaBuilder'
import type { AntennaElement } from '@/types/models'

describe('multiAntennaBuilder', () => {
  // Mock antenna element with mesh and source
  const createMockElement = (overrides?: Partial<AntennaElement>): AntennaElement => ({
    id: 'element-1',
    name: 'Test Dipole',
    type: 'dipole',
    color: '#FF5733',
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    config: {
      length: 0.5,
      wire_radius: 0.001,
      segments: 1,
    },
    mesh: {
      nodes: [
        [0, 0, 0],
        [0, 0, 0.5],
      ],
      edges: [[1, 2]],
      radii: [0.001],
      metadata: {
        total_length: 0.5,
        num_segments: 1,
      },
    },
    sources: [
      {
        type: 'voltage',
        amplitude: { real: 1.0, imag: 0 },
        node_start: 1,
        node_end: 2,
        series_R: 50.0,
        series_L: 0.0,
        series_C_inv: 0.0,
      },
    ],
    lumped_elements: [],
    ...overrides,
  })

  describe('buildMultiAntennaRequest', () => {
    it('should build request for single element', () => {
      const elements = [createMockElement()]
      const frequency = 300e6

      const request = buildMultiAntennaRequest(elements, frequency)

      expect(request.frequency).toBe(frequency)
      expect(request.antennas).toHaveLength(1)
      expect(request.antennas[0].antenna_id).toBe('element-1')
      expect(request.config).toBeDefined()
      expect(request.config?.gauss_order).toBe(6)
    })

    it('should build request for multiple elements', () => {
      const elements = [
        createMockElement({ id: 'element-1', name: 'Dipole 1' }),
        createMockElement({ id: 'element-2', name: 'Dipole 2', position: [1, 0, 0] }),
      ]
      const frequency = 300e6

      const request = buildMultiAntennaRequest(elements, frequency)

      expect(request.antennas).toHaveLength(2)
      expect(request.antennas[0].antenna_id).toBe('element-1')
      expect(request.antennas[1].antenna_id).toBe('element-2')
      // Second element should have position offset applied
      expect(request.antennas[1].nodes[0][0]).toBe(1) // x + 1
    })

    it('should filter out invisible elements', () => {
      const elements = [
        createMockElement({ id: 'visible', visible: true }),
        createMockElement({ id: 'invisible', visible: false }),
      ]

      const request = buildMultiAntennaRequest(elements, 300e6)

      expect(request.antennas).toHaveLength(1)
      expect(request.antennas[0].antenna_id).toBe('visible')
    })

    it('should filter out locked elements', () => {
      const elements = [
        createMockElement({ id: 'unlocked', locked: false }),
        createMockElement({ id: 'locked', locked: true }),
      ]

      const request = buildMultiAntennaRequest(elements, 300e6)

      expect(request.antennas).toHaveLength(1)
      expect(request.antennas[0].antenna_id).toBe('unlocked')
    })

    it('should filter out elements without mesh', () => {
      const elements = [
        createMockElement({ id: 'with-mesh' }),
        createMockElement({ id: 'no-mesh', mesh: undefined }),
      ]

      const request = buildMultiAntennaRequest(elements, 300e6)

      expect(request.antennas).toHaveLength(1)
      expect(request.antennas[0].antenna_id).toBe('with-mesh')
    })

    it('should throw error if no valid elements', () => {
      const elements = [
        createMockElement({ visible: false }),
        createMockElement({ locked: true }),
      ]

      expect(() => buildMultiAntennaRequest(elements, 300e6)).toThrow(
        'No valid elements for simulation'
      )
    })

    it('should use custom solver config', () => {
      const elements = [createMockElement()]
      const config = {
        gauss_order: 4,
        include_skin_effect: false,
        resistivity: 2.82e-8, // Aluminum
      }

      const request = buildMultiAntennaRequest(elements, 300e6, config)

      expect(request.config?.gauss_order).toBe(4)
      expect(request.config?.include_skin_effect).toBe(false)
      expect(request.config?.resistivity).toBe(2.82e-8)
    })
  })

  describe('convertElementToAntennaInput', () => {
    it('should convert element with basic mesh', () => {
      const element = createMockElement()

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.antenna_id).toBe('element-1')
      expect(antenna.nodes).toHaveLength(2)
      expect(antenna.edges).toEqual([[1, 2]])
      expect(antenna.radii).toEqual([0.001])
    })

    it('should apply position offset to nodes', () => {
      const element = createMockElement({
        position: [1, 2, 3],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.nodes[0]).toEqual([1, 2, 3]) // [0,0,0] + [1,2,3]
      expect(antenna.nodes[1]).toEqual([1, 2, 3.5]) // [0,0,0.5] + [1,2,3]
    })

    it('should convert voltage sources', () => {
      const element = createMockElement({
        sources: [
          {
            type: 'voltage',
            amplitude: { real: 2.0, imag: 0.5 },
            node_start: 1,
            node_end: 2,
            series_R: 75.0,
            series_L: 1e-9,
            series_C_inv: 0,
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.voltage_sources).toHaveLength(1)
      expect(antenna.voltage_sources[0].node_start).toBe(1)
      expect(antenna.voltage_sources[0].node_end).toBe(2)
      expect(antenna.voltage_sources[0].value).toBe('2+0.5j') // Full complex value preserved
      expect(antenna.voltage_sources[0].R).toBe(75.0)
      expect(antenna.voltage_sources[0].L).toBe(1e-9)
    })

    it('should convert current sources', () => {
      const element = createMockElement({
        sources: [
          {
            type: 'current',
            amplitude: { real: 0.01, imag: 0 },
            node_start: 1,
            node_end: 0,
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.current_sources).toHaveLength(1)
      expect(antenna.current_sources[0].node).toBe(1)
      expect(antenna.current_sources[0].value).toBe(0.01)
    })

    it('should convert lumped elements', () => {
      const element = createMockElement({
        lumped_elements: [
          {
            type: 'resistor',
            R: 100,
            L: 0,
            C_inv: 0,
            node_start: 1,
            node_end: 0,
            tag: 'Load_1',
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.loads).toHaveLength(1)
      expect(antenna.loads[0].node_start).toBe(1)
      expect(antenna.loads[0].node_end).toBe(0)
      expect(antenna.loads[0].R).toBe(100)
    })

    it('should throw error if element has no mesh', () => {
      const element = createMockElement({ mesh: undefined })

      expect(() => convertElementToAntennaInput(element)).toThrow('has no mesh')
    })
  })

  describe('countSimulationReadyElements', () => {
    it('should count visible, unlocked elements with mesh', () => {
      const elements = [
        createMockElement({ id: '1' }),
        createMockElement({ id: '2' }),
        createMockElement({ id: '3', visible: false }),
        createMockElement({ id: '4', locked: true }),
      ]

      const count = countSimulationReadyElements(elements)

      expect(count).toBe(2)
    })

    it('should return 0 for empty array', () => {
      expect(countSimulationReadyElements([])).toBe(0)
    })

    it('should not count elements with empty mesh', () => {
      const elements = [
        createMockElement({ id: '1' }),
        createMockElement({
          id: '2',
          mesh: {
            nodes: [],
            edges: [],
            radii: [],
            metadata: { total_length: 0, num_segments: 0 },
          },
        }),
      ]

      const count = countSimulationReadyElements(elements)

      expect(count).toBe(1)
    })
  })

  describe('validateHasSources', () => {
    it('should return true if element has voltage source', () => {
      const elements = [createMockElement()]

      expect(validateHasSources(elements)).toBe(true)
    })

    it('should return true if element has current source', () => {
      const elements = [
        createMockElement({
          sources: [
            {
              type: 'current',
              amplitude: { real: 0.001, imag: 0 },
              node_start: 1,
              node_end: 0,
            },
          ],
        }),
      ]

      expect(validateHasSources(elements)).toBe(true)
    })

    it('should return false if no sources', () => {
      const elements = [createMockElement({ sources: [] })]

      expect(validateHasSources(elements)).toBe(false)
    })

    it('should ignore invisible/locked elements', () => {
      const elements = [
        createMockElement({ visible: false }),
        createMockElement({ locked: true }),
      ]

      expect(validateHasSources(elements)).toBe(false)
    })
  })

  describe('getSimulationComplexity', () => {
    it('should calculate total nodes, edges, and sources', () => {
      const elements = [
        createMockElement({
          mesh: {
            nodes: [[0, 0, 0], [0, 0, 0.5]],
            edges: [[1, 2]],
            radii: [0.001],
            metadata: { total_length: 0.5, num_segments: 1 },
          },
          sources: [
            {
              type: 'voltage',
              amplitude: { real: 1, imag: 0 },
              node_start: 1,
              node_end: 2,
            },
          ],
        }),
        createMockElement({
          mesh: {
            nodes: [[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]],
            edges: [[1, 2], [2, 3]],
            radii: [0.001, 0.001],
            metadata: { total_length: 0.5, num_segments: 2 },
          },
          sources: [
            {
              type: 'voltage',
              amplitude: { real: 1, imag: 0 },
              node_start: 2,
              node_end: 3,
            },
          ],
        }),
      ]

      const complexity = getSimulationComplexity(elements)

      expect(complexity.totalNodes).toBe(5) // 2 + 3
      expect(complexity.totalEdges).toBe(3) // 1 + 2
      expect(complexity.totalSources).toBe(2) // 1 + 1
    })

    it('should handle elements without mesh', () => {
      const elements = [
        createMockElement(),
        createMockElement({ mesh: undefined }),
      ]

      const complexity = getSimulationComplexity(elements)

      expect(complexity.totalNodes).toBe(2)
      expect(complexity.totalEdges).toBe(1)
    })

    it('should ignore invisible/locked elements', () => {
      const elements = [
        createMockElement(),
        createMockElement({ visible: false }),
        createMockElement({ locked: true }),
      ]

      const complexity = getSimulationComplexity(elements)

      expect(complexity.totalNodes).toBe(2) // Only first element
    })
  })

  describe('extractComplexValue', () => {
    it('should return real number when imaginary part is zero', () => {
      expect(extractComplexValue({ real: 2.0, imag: 0 })).toBe(2.0)
    })

    it('should return complex string when imaginary part is non-zero', () => {
      expect(extractComplexValue({ real: 1.0, imag: 0.5 })).toBe('1+0.5j')
    })

    it('should handle negative imaginary part', () => {
      expect(extractComplexValue({ real: 1.0, imag: -0.5 })).toBe('1-0.5j')
    })

    it('should handle pure imaginary values', () => {
      expect(extractComplexValue({ real: 0, imag: 1.0 })).toBe('0+1j')
    })

    it('should handle 90-degree phase (0+1j)', () => {
      // 1V at 90°: real = cos(90°) ≈ 0, imag = sin(90°) = 1
      const real = Math.cos(Math.PI / 2)
      const imag = Math.sin(Math.PI / 2)
      const result = extractComplexValue({ real, imag })
      // Should be a string since imag != 0
      expect(typeof result).toBe('string')
      expect(result).toContain('j')
    })

    it('should handle numeric amplitude', () => {
      expect(extractComplexValue(5.0)).toBe(5.0)
    })

    it('should handle string amplitude "1+0j"', () => {
      expect(extractComplexValue('1+0j')).toBe(1.0)
    })

    it('should handle string amplitude with imaginary "2+3j"', () => {
      expect(extractComplexValue('2+3j')).toBe('2+3j')
    })

    it('should default to 1.0 for invalid string', () => {
      expect(extractComplexValue('invalid')).toBe(1.0)
    })
  })

  describe('convertElementToAntennaInput - complex amplitude', () => {
    it('should preserve complex voltage source amplitude through conversion', () => {
      // Simulate 1V at 90° phase: amplitude = { real: 0, imag: 1 }
      const element = createMockElement({
        sources: [
          {
            type: 'voltage',
            amplitude: { real: 0, imag: 1.0 },
            node_start: 1,
            node_end: 2,
            series_R: 50.0,
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.voltage_sources[0].value).toBe('0+1j')
    })

    it('should preserve complex current source amplitude through conversion', () => {
      const element = createMockElement({
        sources: [
          {
            type: 'current',
            amplitude: { real: 0.005, imag: 0.005 },
            node_start: 1,
            node_end: 0,
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.current_sources[0].value).toBe('0.005+0.005j')
    })

    it('should send real-only voltage source as plain number', () => {
      const element = createMockElement({
        sources: [
          {
            type: 'voltage',
            amplitude: { real: 2.0, imag: 0 },
            node_start: 1,
            node_end: 2,
          },
        ],
      })

      const antenna = convertElementToAntennaInput(element)

      expect(antenna.voltage_sources[0].value).toBe(2.0)
      expect(typeof antenna.voltage_sources[0].value).toBe('number')
    })
  })
})
