/**
 * Multi-Antenna Builder
 * Converts AntennaElement[] from Redux into MultiAntennaRequest for solver
 */

import type { AntennaElement, Source } from '@/types/models'
import type {
  MultiAntennaRequest,
  AntennaInput,
  VoltageSourceInput,
  CurrentSourceInput,
  LoadInput,
  SolverConfiguration,
} from '@/types/api'

/**
 * Extract complex value from a Source's amplitude field.
 * Returns a number if purely real, or a Python-compatible complex string "a+bj" if imaginary part is non-zero.
 */
export function extractComplexValue(amplitude: Source['amplitude']): number | string {
  let real = 1.0
  let imag = 0.0

  if (typeof amplitude === 'string') {
    const complexMatch = amplitude.match(/^([+-]?[\d.]+)([+-][\d.]+)j$/)
    if (complexMatch) {
      real = parseFloat(complexMatch[1])
      imag = parseFloat(complexMatch[2])
    } else {
      real = parseFloat(amplitude) || 1.0
    }
  } else if (typeof amplitude === 'object' && amplitude !== null && 'real' in amplitude) {
    real = amplitude.real
    imag = amplitude.imag
  } else if (typeof amplitude === 'number') {
    real = amplitude
  }

  if (imag === 0) return real
  const sign = imag >= 0 ? '+' : ''
  return `${real}${sign}${imag}j`
}

/**
 * Convert multiple AntennaElements into a MultiAntennaRequest
 * This merges all visible, unlocked elements with valid meshes
 */
export function buildMultiAntennaRequest(
  elements: AntennaElement[],
  frequency: number,
  config?: Partial<SolverConfiguration>
): MultiAntennaRequest {
  // Filter elements that are ready for simulation
  const validElements = elements.filter(
    (el) =>
      el.visible &&
      !el.locked &&
      el.mesh &&
      el.mesh.nodes &&
      el.mesh.nodes.length > 0 &&
      el.mesh.edges &&
      el.mesh.edges.length > 0
  )

  if (validElements.length === 0) {
    throw new Error('No valid elements for simulation. Ensure elements have meshes and are visible.')
  }

  // Build antenna inputs
  const antennas: AntennaInput[] = validElements.map((element) =>
    convertElementToAntennaInput(element)
  )

  // Build solver configuration
  const solverConfig: SolverConfiguration = {
    gauss_order: config?.gauss_order || 6,
    include_skin_effect: config?.include_skin_effect !== false,
    resistivity: config?.resistivity || 1.68e-8, // Copper default
    permeability: config?.permeability || 1.0,
  }

  return {
    frequency,
    antennas,
    config: solverConfig,
  }
}

/**
 * Convert a single AntennaElement to AntennaInput format
 * Handles position/rotation transformations and source/load extraction
 */
export function convertElementToAntennaInput(element: AntennaElement): AntennaInput {
  if (!element.mesh) {
    throw new Error(`Element ${element.name} has no mesh`)
  }

  // Extract nodes with position offset applied
  // Note: Rotation is already applied during mesh generation by the backend
  const nodes = element.mesh.nodes.map((node) => [
    node[0] + element.position[0],
    node[1] + element.position[1],
    node[2] + element.position[2],
  ])

  // Edges and radii can be used directly (already 1-based indexing from backend)
  const edges = element.mesh.edges
  const radii = element.mesh.radii

  console.log(`Converting element ${element.name}:`, {
    id: element.id,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    radiiCount: radii.length,
    sources: element.sources?.length || 0,
    sourcesDetails: element.sources,
    position: element.position,
  });

  // Convert sources - handle balanced feed patterns
  const voltage_sources: VoltageSourceInput[] = []
  const current_sources: CurrentSourceInput[] = []

  if (element.sources && element.sources.length > 0) {
    console.log(`Processing ${element.sources.length} sources for ${element.name}`, element.sources);

    // Check for balanced feed pattern: two voltage sources from node_start=0
    const centerTapSources = element.sources.filter(
      s => s.type === 'voltage' && s.node_start === 0 && s.node_end !== 0
    );

    if (centerTapSources.length === 2) {
      // Convert balanced feed (two center-tap sources) to gap source
      const source1 = centerTapSources[0];
      const source2 = centerTapSources[1];

      console.log(`Converting balanced feed to gap source for ${element.name}: nodes ${source1.node_end} → ${source2.node_end}`);

      voltage_sources.push({
        node_start: source1.node_end,
        node_end: source2.node_end,
        value: extractComplexValue(source1.amplitude),
        R: source1.series_R || 0.0,
        L: source1.series_L || 0.0,
        C_inv: source1.series_C_inv || 0.0,
      });
    } else {
      // Process sources normally (non-balanced feed)
      for (const source of element.sources) {
        if (source.type === 'voltage') {
          // Sources with node_start=0 are valid (ground reference)
          // Only skip if BOTH nodes are 0
          if (source.node_start === 0 && source.node_end === 0) {
            console.warn(`Skipping invalid source with both nodes=0: ${element.name}`);
            continue;
          }

          voltage_sources.push({
            node_start: source.node_start,
            node_end: source.node_end,
            value: extractComplexValue(source.amplitude),
            R: source.series_R || 0.0,
            L: source.series_L || 0.0,
            C_inv: source.series_C_inv || 0.0,
          })
        } else if (source.type === 'current') {
          if (source.node_start === 0) {
            console.warn(`Skipping current source with node=0 (invalid for solver API): ${element.name}`);
            continue;
          }

          current_sources.push({
            node: source.node_start,
            value: extractComplexValue(source.amplitude),
            ...(source.node_end != null ? { node_end: source.node_end } : {}),
          })
        }
      }
    }
  } else {
    console.warn(`No sources found on element ${element.name}`);
  }

  // Convert lumped elements
  const loads: LoadInput[] = []
  if (element.lumped_elements) {
    for (const le of element.lumped_elements) {
      loads.push({
        node_start: le.node_start,
        node_end: le.node_end,
        R: le.R || 0.0,
        L: le.L || 0.0,
        C_inv: le.C_inv || 0.0,
      })
    }
  }

  const result: AntennaInput = {
    antenna_id: element.id,
    nodes,
    edges,
    radii,
    voltage_sources,
    current_sources,
    loads,
  }

  console.log(`Converted antenna ${element.name}:`, {
    antenna_id: result.antenna_id,
    nodes_count: result.nodes.length,
    edges_count: result.edges.length,
    voltage_sources_count: result.voltage_sources.length,
    first_node: result.nodes[0],
    first_edge: result.edges[0],
    first_voltage_source: result.voltage_sources[0],
  })

  return result
}

/**
 * Get simulation-ready elements count
 */
export function countSimulationReadyElements(elements: AntennaElement[]): number {
  return elements.filter(
    (el) =>
      el.visible &&
      !el.locked &&
      el.mesh &&
      el.mesh.nodes &&
      el.mesh.nodes.length > 0 &&
      el.mesh.edges &&
      el.mesh.edges.length > 0
  ).length
}

/**
 * Validate that at least one element has a source
 */
export function validateHasSources(elements: AntennaElement[]): boolean {
  return elements.some(
    (el) =>
      el.visible &&
      !el.locked &&
      el.sources &&
      el.sources.length > 0 &&
      el.sources.some((s) => s.type === 'voltage' || s.type === 'current')
  )
}

/**
 * Get total node and edge count for progress estimation
 */
export function getSimulationComplexity(elements: AntennaElement[]): {
  totalNodes: number
  totalEdges: number
  totalSources: number
} {
  const validElements = elements.filter(
    (el) => el.visible && !el.locked && el.mesh
  )

  let totalNodes = 0
  let totalEdges = 0
  let totalSources = 0

  for (const el of validElements) {
    if (el.mesh) {
      totalNodes += el.mesh.nodes?.length || 0
      totalEdges += el.mesh.edges?.length || 0
    }
    totalSources += el.sources?.length || 0
  }

  return { totalNodes, totalEdges, totalSources }
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  element: string
  message: string
}

/**
 * Validate geometry of all visible/unlocked elements.
 * Checks: connected nodes, valid edges, lumped elements on both poles,
 * at least one source, segment length vs wavelength.
 */
export function validateGeometry(
  elements: AntennaElement[],
  frequencyHz?: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const visibleElements = elements.filter((el) => el.visible && !el.locked)

  if (visibleElements.length === 0) {
    issues.push({ severity: 'error', element: 'Design', message: 'No visible/unlocked elements' })
    return issues
  }

  // Global: at least one source
  const hasAnySource = visibleElements.some(
    (el) => el.sources && el.sources.length > 0
  )
  if (!hasAnySource) {
    issues.push({ severity: 'error', element: 'Design', message: 'At least one source is required' })
  }

  for (const el of visibleElements) {
    const name = el.name || el.id

    if (!el.mesh || !el.mesh.nodes || el.mesh.nodes.length < 2) {
      issues.push({ severity: 'error', element: name, message: 'No mesh or too few nodes' })
      continue
    }
    if (!el.mesh.edges || el.mesh.edges.length < 1) {
      issues.push({ severity: 'error', element: name, message: 'No edges in mesh' })
      continue
    }

    const numNodes = el.mesh.nodes.length

    // Check edges reference valid node indices (1-based, 0 = ground, negative = appended)
    for (let i = 0; i < el.mesh.edges.length; i++) {
      const [a, b] = el.mesh.edges[i]
      // Valid range: negative (appended), 0 (ground), or 1..numNodes (1-based)
      const isValidIndex = (idx: number) => idx <= numNodes
      if (!isValidIndex(a) || !isValidIndex(b)) {
        issues.push({
          severity: 'error',
          element: name,
          message: `Edge ${i} references non-existing node (${a}, ${b})`,
        })
      }
    }

    // Check all mesh nodes are connected (appear in at least one edge)
    // Edges use 1-based indexing; translate to 0-based for set comparison
    const usedNodes = new Set<number>()
    for (const [a, b] of el.mesh.edges) {
      if (a >= 1 && a <= numNodes) usedNodes.add(a - 1)
      if (b >= 1 && b <= numNodes) usedNodes.add(b - 1)
    }
    const disconnectedCount = numNodes - usedNodes.size
    if (disconnectedCount > 0) {
      issues.push({
        severity: 'warning',
        element: name,
        message: `${disconnectedCount} disconnected node(s) not referenced by any edge`,
      })
    }

    // Check lumped elements have valid node connections (1-based, 0 = ground)
    if (el.lumped_elements) {
      for (const le of el.lumped_elements) {
        if (le.node_start < 0 || le.node_start > numNodes) {
          issues.push({
            severity: 'error',
            element: name,
            message: `Lumped element has invalid node_start: ${le.node_start}`,
          })
        }
        if (le.node_end < 0 || le.node_end > numNodes) {
          issues.push({
            severity: 'error',
            element: name,
            message: `Lumped element has invalid node_end: ${le.node_end}`,
          })
        }
      }
    }

    // Segment length vs wavelength check
    if (frequencyHz && frequencyHz > 0) {
      const c = 299792458 // speed of light
      const wavelength = c / frequencyHz
      const maxSegLength = wavelength / 10 // λ/10 rule

      for (let i = 0; i < el.mesh.edges.length; i++) {
        const [a, b] = el.mesh.edges[i]
        // Convert 1-based to 0-based for array access
        const ai = a - 1
        const bi = b - 1
        if (ai >= 0 && ai < numNodes && bi >= 0 && bi < numNodes) {
          const na = el.mesh.nodes[ai]
          const nb = el.mesh.nodes[bi]
          const dx = nb[0] - na[0]
          const dy = nb[1] - na[1]
          const dz = nb[2] - na[2]
          const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (segLen > maxSegLength) {
            issues.push({
              severity: 'warning',
              element: name,
              message: `Segment ${i} length (${(segLen * 100).toFixed(2)} cm) exceeds λ/10 (${(maxSegLength * 100).toFixed(2)} cm) at ${(frequencyHz / 1e6).toFixed(1)} MHz`,
            })
            break // Only report once per element
          }
        }
      }
    }
  }

  return issues
}
