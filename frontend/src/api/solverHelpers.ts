/**
 * Helper functions for solver API
 * Converts between legacy single-antenna and new multi-antenna formats
 */

import type { SolverRequest } from '@/types/models'
import type {
  MultiAntennaRequest,
  AntennaInput,
  VoltageSourceInput,
  CurrentSourceInput,
  LoadInput,
  SolverConfiguration,
} from '@/types/api'

/**
 * Convert legacy SolverRequest to MultiAntennaRequest format
 * This allows existing code to work with the new multi-antenna solver
 */
export function convertToMultiAntennaRequest(
  request: SolverRequest,
  antennaId: string = 'antenna_1'
): MultiAntennaRequest {
  // Convert sources
  const voltage_sources: VoltageSourceInput[] = []
  const current_sources: CurrentSourceInput[] = []
  const loads: LoadInput[] = []

  // Handle voltage sources - convert 0-based to 1-based indexing
  if (request.sources) {
    for (const source of request.sources) {
      if (source.type === 'voltage') {
        voltage_sources.push({
          node_start: source.node === undefined ? 1 : source.node + 1, // 0-based to 1-based
          node_end: 0, // Ground
          value: source.amplitude || 1.0,
          R: source.impedance || 0.0,
          L: 0.0,
          C_inv: 0.0,
        })
      } else if (source.type === 'current') {
        current_sources.push({
          node: source.node === undefined ? 1 : source.node + 1, // 0-based to 1-based
          value: source.amplitude || 0.001,
        })
      }
    }
  }

  // Handle lumped elements - convert 0-based to 1-based indexing
  if (request.lumped_elements) {
    for (const element of request.lumped_elements) {
      loads.push({
        node_start: element.node_start + 1, // 0-based to 1-based
        node_end: element.node_end + 1, // 0-based to 1-based
        R: element.resistance || 0.0,
        L: element.inductance || 0.0,
        C_inv: element.capacitance ? 1.0 / element.capacitance : 0.0,
      })
    }
  }

  // Build antenna input with 1-based indexing
  const antenna: AntennaInput = {
    antenna_id: antennaId,
    nodes: request.nodes, // Already in [x,y,z] format
    edges: request.edges.map(([start, end]) => [start + 1, end + 1]), // Convert 0-based to 1-based
    radii: request.radii,
    voltage_sources,
    current_sources,
    loads,
  }

  // Build configuration
  const config: SolverConfiguration = {
    gauss_order: request.gauss_order || 6,
    include_skin_effect: true,
    resistivity: 1.68e-8, // Copper
    permeability: 1.0,
  }

  return {
    frequency: request.frequency,
    antennas: [antenna],
    config,
  }
}

/**
 * Parse complex number from various formats
 * Backend may return: number, string "1+2j", or object {real: 1, imag: 2}
 */
export function parseComplex(
  value: number | string | { real: number; imag: number }
): { real: number; imag: number } {
  if (typeof value === 'number') {
    return { real: value, imag: 0 }
  } else if (typeof value === 'string') {
    // Parse "1.0+2.0j" or "1.0-2.0j" format
    const match = value.match(/^([+-]?[\d.]+)([+-][\d.]+)j$/)
    if (match) {
      return {
        real: parseFloat(match[1]),
        imag: parseFloat(match[2]),
      }
    }
    // Parse just real "1.0"
    const realOnly = parseFloat(value)
    if (!isNaN(realOnly)) {
      return { real: realOnly, imag: 0 }
    }
    throw new Error(`Cannot parse complex number: ${value}`)
  } else {
    return value
  }
}

/**
 * Get magnitude of complex number
 */
export function complexMagnitude(z: { real: number; imag: number }): number {
  return Math.sqrt(z.real * z.real + z.imag * z.imag)
}

/**
 * Get phase of complex number in degrees
 */
export function complexPhase(z: { real: number; imag: number }): number {
  return (Math.atan2(z.imag, z.real) * 180) / Math.PI
}

/**
 * Format complex number for display
 */
export function formatComplex(
  z: { real: number; imag: number },
  decimals: number = 2
): string {
  const real = z.real.toFixed(decimals)
  const imag = Math.abs(z.imag).toFixed(decimals)
  const sign = z.imag >= 0 ? '+' : '-'
  return `${real}${sign}${imag}j`
}
