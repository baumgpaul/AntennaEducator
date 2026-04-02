/**
 * Circuit editor data model types.
 *
 * The circuit editor allows users to build lumped element networks
 * between an antenna element's terminal mesh nodes, GND, and
 * user-defined appended nodes.
 *
 * Components (R, L, C, voltage source, current source) connect
 * between any two nodes. Arbitrary topologies (series, parallel,
 * bridge, etc.) are defined implicitly by sharing intermediate nodes.
 */

// ============================================================================
// Circuit Node Types
// ============================================================================

/**
 * Type of node in the circuit editor.
 * - 'terminal': Mesh node flagged as a circuit connection point
 * - 'gnd': Ground / reference node (index 0, always present)
 * - 'appended': User-created auxiliary node (negative index: -1, -2, ...)
 */
export type CircuitNodeKind = 'terminal' | 'gnd' | 'appended';

export interface CircuitNode {
  /** Unique node index: positive for mesh terminals, 0 for GND, negative for appended */
  index: number;
  kind: CircuitNodeKind;
  /** User-facing label (e.g., "GND", "Node 3", "Matching A") */
  label: string;
  /** Position on the React Flow canvas (px) */
  positionX: number;
  positionY: number;
}

// ============================================================================
// Circuit Component Types
// ============================================================================

export type CircuitComponentType = 'resistor' | 'inductor' | 'capacitor' | 'voltage_source' | 'current_source';

export interface CircuitComponent {
  /** Unique identifier for this component */
  id: string;
  type: CircuitComponentType;
  /** Node index of the first connection */
  nodeA: number;
  /** Node index of the second connection */
  nodeB: number;
  /** Component value (Ohms for R, Henries for L, Farads for C, Volts for V, Amps for I) */
  value: number;
  /** Phase angle in degrees (only for sources) */
  phase: number;
  /** Optional user label */
  label: string;
  /** Raw expression string (for variable support) */
  valueExpression?: string;
  /** Raw expression string for phase */
  phaseExpression?: string;
}

// ============================================================================
// Circuit State (per antenna element)
// ============================================================================

export interface CircuitState {
  nodes: CircuitNode[];
  components: CircuitComponent[];
}

// ============================================================================
// Defaults & Utilities
// ============================================================================

/** Default values per component type */
export const COMPONENT_DEFAULTS: Record<CircuitComponentType, { value: number; unit: string; symbol: string }> = {
  resistor: { value: 50, unit: 'Ω', symbol: 'R' },
  inductor: { value: 1e-9, unit: 'H', symbol: 'L' },
  capacitor: { value: 1e-12, unit: 'F', symbol: 'C' },
  voltage_source: { value: 1, unit: 'V', symbol: 'V' },
  current_source: { value: 1, unit: 'A', symbol: 'I' },
};

/** Human-readable label for component type */
export const COMPONENT_TYPE_LABELS: Record<CircuitComponentType, string> = {
  resistor: 'Resistor',
  inductor: 'Inductor',
  capacitor: 'Capacitor',
  voltage_source: 'Voltage Source',
  current_source: 'Current Source',
};

// ============================================================================
// Conversions: CircuitState ↔ Sources + LumpedElements
// ============================================================================

import type { Source, LumpedElement, ComplexNumber, Mesh, Vector3D } from '@/types/models';

/**
 * Convert circuit components into Source[] and LumpedElement[] for the backend.
 */
export function circuitToBackend(circuit: CircuitState): {
  sources: Source[];
  lumped_elements: LumpedElement[];
} {
  const sources: Source[] = [];
  const lumped_elements: LumpedElement[] = [];

  for (const comp of circuit.components) {
    if (comp.type === 'voltage_source' || comp.type === 'current_source') {
      const phaseRad = (comp.phase * Math.PI) / 180;
      const amplitude: ComplexNumber = {
        real: comp.value * Math.cos(phaseRad),
        imag: comp.value * Math.sin(phaseRad),
      };
      sources.push({
        type: comp.type === 'voltage_source' ? 'voltage' : 'current',
        amplitude,
        node_start: comp.nodeA,
        node_end: comp.nodeB,
        tag: comp.label || undefined,
      });
    } else {
      const R = comp.type === 'resistor' ? comp.value : 0;
      const L = comp.type === 'inductor' ? comp.value : 0;
      const C_inv = comp.type === 'capacitor' && comp.value > 0 ? 1 / comp.value : 0;

      lumped_elements.push({
        type: comp.type === 'resistor' ? 'resistor'
            : comp.type === 'inductor' ? 'inductor'
            : 'capacitor',
        R,
        L,
        C_inv,
        node_start: comp.nodeA,
        node_end: comp.nodeB,
        tag: comp.label || undefined,
      });
    }
  }

  return { sources, lumped_elements };
}

/**
 * Convert existing Sources + LumpedElements into CircuitState components.
 * Used when loading an existing element into the circuit editor.
 */
export function backendToCircuit(
  sources: Source[],
  lumpedElements: LumpedElement[],
  terminalNodeIndices: number[],
  existingAppendedNodes?: Array<{ index: number; label: string }>,
  mesh?: Mesh,
): CircuitState {
  const nodeSet = new Set<number>();
  const terminalSet = new Set<number>(terminalNodeIndices);
  const components: CircuitComponent[] = [];

  // Always include GND
  nodeSet.add(0);

  // Include terminal nodes
  for (const idx of terminalNodeIndices) {
    nodeSet.add(idx);
  }

  // Include appended nodes from existing data
  if (existingAppendedNodes) {
    for (const an of existingAppendedNodes) {
      nodeSet.add(an.index);
    }
  }

  let compId = 1;

  // Convert sources
  for (const src of sources) {
    const nodeA = src.node_start ?? 0;
    const nodeB = src.node_end ?? 0;
    nodeSet.add(nodeA);
    nodeSet.add(nodeB);

    const amp = typeof src.amplitude === 'object' && src.amplitude !== null && 'real' in src.amplitude
      ? src.amplitude as ComplexNumber
      : { real: Number(src.amplitude) || 1, imag: 0 };

    const magnitude = Math.sqrt(amp.real * amp.real + amp.imag * amp.imag);
    const phase = Math.atan2(amp.imag, amp.real) * (180 / Math.PI);

    components.push({
      id: `comp-${compId++}`,
      type: src.type === 'voltage' ? 'voltage_source' : 'current_source',
      nodeA,
      nodeB,
      value: magnitude,
      phase,
      label: src.tag || '',
    });
  }

  // Convert lumped elements
  for (const le of lumpedElements) {
    nodeSet.add(le.node_start);
    nodeSet.add(le.node_end);

    let type: CircuitComponentType;
    let value: number;

    if (le.R > 0 && le.L === 0 && le.C_inv === 0) {
      type = 'resistor';
      value = le.R;
    } else if (le.L > 0 && le.R === 0 && le.C_inv === 0) {
      type = 'inductor';
      value = le.L;
    } else if (le.C_inv > 0 && le.R === 0 && le.L === 0) {
      type = 'capacitor';
      value = 1 / le.C_inv;
    } else {
      // RLC combination — represent as resistor with the R value
      // (individual R/L/C components should be separate in the circuit editor)
      type = 'resistor';
      value = le.R;
    }

    components.push({
      id: `comp-${compId++}`,
      type,
      nodeA: le.node_start,
      nodeB: le.node_end,
      value,
      phase: 0,
      label: le.tag || '',
    });
  }

  // Build nodes
  const nodes: CircuitNode[] = [];
  const sortedIndices = Array.from(nodeSet).sort((a, b) => a - b);

  // Helper: generate coordinate hint for a mesh node index
  const coordHint = (idx: number): string => {
    if (!mesh?.nodes || idx <= 0 || idx > mesh.nodes.length) return '';
    const pos: Vector3D = mesh.nodes[idx - 1]; // mesh nodes are 0-indexed, indices are 1-based
    const fmt = (v: number) => (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : v.toFixed(3));
    return ` [${fmt(pos[0])}, ${fmt(pos[1])}, ${fmt(pos[2])}]`;
  };

  // Classify nodes into terminal (from terminalNodeIndices), other mesh nodes, appended, and GND
  const terminalNodes = sortedIndices.filter(i => terminalSet.has(i));
  const otherMeshNodes = sortedIndices.filter(i => i > 0 && !terminalSet.has(i));
  const gndNode = sortedIndices.includes(0) ? [0] : [];
  const appendedNodes = sortedIndices.filter(i => i < 0);

  let y = 50;
  const xCenter = 250;

  // Terminal nodes across the top
  for (let i = 0; i < terminalNodes.length; i++) {
    const idx = terminalNodes[i];
    nodes.push({
      index: idx,
      kind: 'terminal',
      label: `Feed ${i + 1}${coordHint(idx)}`,
      positionX: 100 + i * 200,
      positionY: y,
    });
  }

  y += 150;

  // Other mesh nodes (referenced by components but not terminal)
  for (let i = 0; i < otherMeshNodes.length; i++) {
    const idx = otherMeshNodes[i];
    nodes.push({
      index: idx,
      kind: 'terminal',
      label: `Node ${idx}${coordHint(idx)}`,
      positionX: 100 + i * 200,
      positionY: y,
    });
  }

  if (otherMeshNodes.length > 0) y += 150;

  // Appended nodes in the middle
  for (let i = 0; i < appendedNodes.length; i++) {
    const idx = appendedNodes[i];
    const existingLabel = existingAppendedNodes?.find(n => n.index === idx)?.label || '';
    nodes.push({
      index: idx,
      kind: 'appended',
      label: existingLabel || `Aux ${Math.abs(idx)}`,
      positionX: 100 + i * 200,
      positionY: y,
    });
  }

  if (appendedNodes.length > 0) y += 150;
  else y += 200;

  // GND at the bottom center
  if (gndNode.length > 0) {
    nodes.push({
      index: 0,
      kind: 'gnd',
      label: 'GND',
      positionX: xCenter,
      positionY: y,
    });
  }

  return { nodes, components };
}

/**
 * Get the next available appended node index (most negative - 1).
 */
export function nextAppendedIndex(circuit: CircuitState): number {
  const appended = circuit.nodes.filter(n => n.kind === 'appended');
  if (appended.length === 0) return -1;
  return Math.min(...appended.map(n => n.index)) - 1;
}

/**
 * Format a component value with appropriate SI prefix.
 */
export function formatComponentValue(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;

  const absVal = Math.abs(value);

  if (absVal >= 1e9) return `${(value / 1e9).toPrecision(3)} G${unit}`;
  if (absVal >= 1e6) return `${(value / 1e6).toPrecision(3)} M${unit}`;
  if (absVal >= 1e3) return `${(value / 1e3).toPrecision(3)} k${unit}`;
  if (absVal >= 1) return `${value.toPrecision(3)} ${unit}`;
  if (absVal >= 1e-3) return `${(value * 1e3).toPrecision(3)} m${unit}`;
  if (absVal >= 1e-6) return `${(value * 1e6).toPrecision(3)} µ${unit}`;
  if (absVal >= 1e-9) return `${(value * 1e9).toPrecision(3)} n${unit}`;
  if (absVal >= 1e-12) return `${(value * 1e12).toPrecision(3)} p${unit}`;

  return `${value.toExponential(2)} ${unit}`;
}
