/**
 * Multi-Antenna Builder
 * Converts AntennaElement[] from Redux into MultiAntennaRequest for solver
 */

import type { AntennaElement } from '@/types/models'
import type {
  MultiAntennaRequest,
  AntennaInput,
  VoltageSourceInput,
  CurrentSourceInput,
  LoadInput,
  SolverConfiguration,
} from '@/types/api'

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

      // Parse amplitude from first source
      let amplitude = 1.0;
      if (typeof source1.amplitude === 'string') {
        const complexMatch = source1.amplitude.match(/^([+-]?[\d.]+)([+-][\d.]+)j$/);
        if (complexMatch) {
          amplitude = parseFloat(complexMatch[1]);
        } else {
          amplitude = parseFloat(source1.amplitude) || 1.0;
        }
      } else if (typeof source1.amplitude === 'object' && 'real' in source1.amplitude) {
        amplitude = source1.amplitude.real;
      } else if (typeof source1.amplitude === 'number') {
        amplitude = source1.amplitude;
      }

      console.log(`Converting balanced feed to gap source for ${element.name}: nodes ${source1.node_end} → ${source2.node_end}`);

      voltage_sources.push({
        node_start: source1.node_end,
        node_end: source2.node_end,
        value: amplitude,
        R: source1.series_R || 0.0,
        L: source1.series_L || 0.0,
        C_inv: source1.series_C_inv || 0.0,
      });
    } else {
      // Process sources normally (non-balanced feed)
      for (const source of element.sources) {
        if (source.type === 'voltage') {
          // Convert amplitude - handle various formats
          let amplitude = 1.0;
          if (typeof source.amplitude === 'string') {
            // Parse string format like "1+0j" or "-1+-0j"
            const complexMatch = source.amplitude.match(/^([+-]?[\d.]+)([+-][\d.]+)j$/);
            if (complexMatch) {
              amplitude = parseFloat(complexMatch[1]);
            } else {
              amplitude = parseFloat(source.amplitude) || 1.0;
            }
          } else if (typeof source.amplitude === 'object' && 'real' in source.amplitude) {
            amplitude = source.amplitude.real;
          } else if (typeof source.amplitude === 'number') {
            amplitude = source.amplitude;
          }

          // Sources with node_start=0 are valid (ground reference)
          // Only skip if BOTH nodes are 0
          if (source.node_start === 0 && source.node_end === 0) {
            console.warn(`Skipping invalid source with both nodes=0: ${element.name}`);
            continue;
          }

          voltage_sources.push({
            node_start: source.node_start,
            node_end: source.node_end,
            value: amplitude,
            R: source.series_R || 0.0,
            L: source.series_L || 0.0,
            C_inv: source.series_C_inv || 0.0,
          })
        } else if (source.type === 'current') {
          // Convert amplitude
          let amplitude = 0.001;
          if (typeof source.amplitude === 'string') {
            amplitude = parseFloat(source.amplitude) || 0.001;
          } else if (typeof source.amplitude === 'object' && 'real' in source.amplitude) {
            amplitude = source.amplitude.real;
          } else if (typeof source.amplitude === 'number') {
            amplitude = source.amplitude;
          }

          if (source.node_start === 0) {
            console.warn(`Skipping current source with node=0 (invalid for solver API): ${element.name}`);
            continue;
          }

          current_sources.push({
            node: source.node_start,
            value: amplitude,
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
