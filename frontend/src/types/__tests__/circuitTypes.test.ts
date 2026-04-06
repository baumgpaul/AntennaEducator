/**
 * Tests for circuit editor data model types and conversion utilities.
 *
 * Phase 3: Lumped Element & Port System
 */
import { describe, expect, it } from 'vitest';

import {
  circuitToBackend,
  backendToCircuit,
  nextAppendedIndex,
  formatComponentValue,
  COMPONENT_DEFAULTS,
  COMPONENT_TYPE_LABELS,
} from '@/types/circuitTypes';
import type { CircuitState } from '@/types/circuitTypes';
import type { Source, LumpedElement } from '@/types/models';

// ============================================================================
// circuitToBackend
// ============================================================================

describe('circuitToBackend', () => {
  it('converts a resistor component to lumped element', () => {
    const circuit: CircuitState = {
      nodes: [
        { index: 1, kind: 'terminal', label: 'Node 1', positionX: 0, positionY: 0 },
        { index: 0, kind: 'gnd', label: 'GND', positionX: 0, positionY: 200 },
      ],
      components: [
        { id: 'c1', type: 'resistor', nodeA: 1, nodeB: 0, value: 50, phase: 0, label: 'Load' },
      ],
    };

    const result = circuitToBackend(circuit);

    expect(result.sources).toHaveLength(0);
    expect(result.lumped_elements).toHaveLength(1);
    expect(result.lumped_elements[0]).toEqual({
      type: 'resistor',
      R: 50,
      L: 0,
      C_inv: 0,
      node_start: 1,
      node_end: 0,
      tag: 'Load',
    });
  });

  it('converts an inductor component', () => {
    const circuit: CircuitState = {
      nodes: [],
      components: [
        { id: 'c1', type: 'inductor', nodeA: 1, nodeB: -1, value: 1e-9, phase: 0, label: '' },
      ],
    };

    const result = circuitToBackend(circuit);
    expect(result.lumped_elements[0].L).toBe(1e-9);
    expect(result.lumped_elements[0].R).toBe(0);
    expect(result.lumped_elements[0].C_inv).toBe(0);
    expect(result.lumped_elements[0].type).toBe('inductor');
  });

  it('converts a capacitor component with C → C_inv', () => {
    const circuit: CircuitState = {
      nodes: [],
      components: [
        { id: 'c1', type: 'capacitor', nodeA: 2, nodeB: 0, value: 1e-12, phase: 0, label: 'Cap' },
      ],
    };

    const result = circuitToBackend(circuit);
    expect(result.lumped_elements[0].C_inv).toBeCloseTo(1e12);
    expect(result.lumped_elements[0].R).toBe(0);
    expect(result.lumped_elements[0].L).toBe(0);
    expect(result.lumped_elements[0].type).toBe('capacitor');
  });

  it('converts a voltage source with phase', () => {
    const circuit: CircuitState = {
      nodes: [],
      components: [
        { id: 'c1', type: 'voltage_source', nodeA: 0, nodeB: 1, value: 1, phase: 90, label: 'Feed' },
      ],
    };

    const result = circuitToBackend(circuit);
    expect(result.sources).toHaveLength(1);
    expect(result.lumped_elements).toHaveLength(0);

    const src = result.sources[0];
    expect(src.type).toBe('voltage');
    expect(src.node_start).toBe(0);
    expect(src.node_end).toBe(1);
    expect(src.tag).toBe('Feed');

    // 1V at 90° → real≈0, imag≈1
    const amp = src.amplitude as { real: number; imag: number };
    expect(amp.real).toBeCloseTo(0, 5);
    expect(amp.imag).toBeCloseTo(1, 5);
  });

  it('converts a current source', () => {
    const circuit: CircuitState = {
      nodes: [],
      components: [
        { id: 'c1', type: 'current_source', nodeA: 1, nodeB: 2, value: 0.5, phase: 0, label: '' },
      ],
    };

    const result = circuitToBackend(circuit);
    expect(result.sources[0].type).toBe('current');
    const amp = result.sources[0].amplitude as { real: number; imag: number };
    expect(amp.real).toBeCloseTo(0.5);
    expect(amp.imag).toBeCloseTo(0);
  });

  it('converts mixed components correctly', () => {
    const circuit: CircuitState = {
      nodes: [],
      components: [
        { id: 'c1', type: 'voltage_source', nodeA: 0, nodeB: 1, value: 1, phase: 0, label: 'V1' },
        { id: 'c2', type: 'resistor', nodeA: 1, nodeB: -1, value: 100, phase: 0, label: 'R1' },
        { id: 'c3', type: 'capacitor', nodeA: -1, nodeB: 0, value: 10e-12, phase: 0, label: 'C1' },
      ],
    };

    const result = circuitToBackend(circuit);
    expect(result.sources).toHaveLength(1);
    expect(result.lumped_elements).toHaveLength(2);
    expect(result.lumped_elements[0].type).toBe('resistor');
    expect(result.lumped_elements[1].type).toBe('capacitor');
  });

  it('empty circuit produces empty arrays', () => {
    const result = circuitToBackend({ nodes: [], components: [] });
    expect(result.sources).toEqual([]);
    expect(result.lumped_elements).toEqual([]);
  });
});

// ============================================================================
// backendToCircuit
// ============================================================================

describe('backendToCircuit', () => {
  it('creates GND node even with no data', () => {
    const circuit = backendToCircuit([], [], []);
    expect(circuit.nodes.find(n => n.kind === 'gnd')).toBeTruthy();
    expect(circuit.components).toHaveLength(0);
  });

  it('includes terminal nodes from mesh', () => {
    const circuit = backendToCircuit([], [], [1, 5, 10]);
    const terminalNodes = circuit.nodes.filter(n => n.kind === 'terminal');
    expect(terminalNodes).toHaveLength(3);
    expect(terminalNodes.map(n => n.index)).toContain(1);
    expect(terminalNodes.map(n => n.index)).toContain(5);
    expect(terminalNodes.map(n => n.index)).toContain(10);
    // Terminal labels are now 'Feed N' format
    expect(terminalNodes.map(n => n.label)).toContain('Feed 1');
    expect(terminalNodes.map(n => n.label)).toContain('Feed 2');
    expect(terminalNodes.map(n => n.label)).toContain('Feed 3');
  });

  it('converts a voltage source back to component', () => {
    const sources: Source[] = [{
      type: 'voltage',
      amplitude: { real: 1, imag: 0 },
      node_start: 0,
      node_end: 1,
      tag: 'Feed',
    }];

    const circuit = backendToCircuit(sources, [], [1]);
    expect(circuit.components).toHaveLength(1);

    const comp = circuit.components[0];
    expect(comp.type).toBe('voltage_source');
    expect(comp.nodeA).toBe(0);
    expect(comp.nodeB).toBe(1);
    expect(comp.value).toBeCloseTo(1);
    expect(comp.phase).toBeCloseTo(0);
    expect(comp.label).toBe('Feed');
  });

  it('converts a source with complex amplitude preserving phase', () => {
    const sources: Source[] = [{
      type: 'voltage',
      amplitude: { real: 0, imag: 1 }, // 1V at 90°
      node_start: 0,
      node_end: 1,
    }];

    const circuit = backendToCircuit(sources, [], [1]);
    expect(circuit.components[0].value).toBeCloseTo(1);
    expect(circuit.components[0].phase).toBeCloseTo(90);
  });

  it('converts a resistor lumped element', () => {
    const lumped: LumpedElement[] = [{
      type: 'resistor',
      R: 50,
      L: 0,
      C_inv: 0,
      node_start: 1,
      node_end: 0,
    }];

    const circuit = backendToCircuit([], lumped, [1]);
    expect(circuit.components).toHaveLength(1);
    expect(circuit.components[0].type).toBe('resistor');
    expect(circuit.components[0].value).toBe(50);
  });

  it('converts a capacitor with C_inv back to Farads', () => {
    const lumped: LumpedElement[] = [{
      type: 'capacitor',
      R: 0,
      L: 0,
      C_inv: 1e12, // 1pF
      node_start: 2,
      node_end: 0,
    }];

    const circuit = backendToCircuit([], lumped, [2]);
    expect(circuit.components[0].type).toBe('capacitor');
    expect(circuit.components[0].value).toBeCloseTo(1e-12);
  });

  it('includes existing appended nodes', () => {
    const circuit = backendToCircuit([], [], [1], [
      { index: -1, label: 'Match A' },
      { index: -2, label: 'Match B' },
    ]);

    const appended = circuit.nodes.filter(n => n.kind === 'appended');
    expect(appended).toHaveLength(2);
    // Sorted by index (most negative first): -2, then -1
    expect(appended[0].label).toBe('Match B');
    expect(appended[1].label).toBe('Match A');
  });

  it('roundtrip: circuitToBackend → backendToCircuit preserves component types', () => {
    const original: CircuitState = {
      nodes: [
        { index: 1, kind: 'terminal', label: 'Feed 1', positionX: 0, positionY: 0 },
        { index: 0, kind: 'gnd', label: 'GND', positionX: 0, positionY: 200 },
      ],
      components: [
        { id: 'c1', type: 'voltage_source', nodeA: 0, nodeB: 1, value: 1, phase: 0, label: '' },
        { id: 'c2', type: 'resistor', nodeA: 1, nodeB: 0, value: 50, phase: 0, label: '' },
      ],
    };

    const { sources, lumped_elements } = circuitToBackend(original);
    const restored = backendToCircuit(sources, lumped_elements, [1]);

    expect(restored.components).toHaveLength(2);
    const types = restored.components.map(c => c.type).sort();
    expect(types).toEqual(['resistor', 'voltage_source']);
  });
});

// ============================================================================
// nextAppendedIndex
// ============================================================================

describe('nextAppendedIndex', () => {
  it('returns -1 when no appended nodes exist', () => {
    const circuit: CircuitState = {
      nodes: [{ index: 0, kind: 'gnd', label: 'GND', positionX: 0, positionY: 0 }],
      components: [],
    };
    expect(nextAppendedIndex(circuit)).toBe(-1);
  });

  it('returns next negative index after existing appended nodes', () => {
    const circuit: CircuitState = {
      nodes: [
        { index: 0, kind: 'gnd', label: 'GND', positionX: 0, positionY: 0 },
        { index: -1, kind: 'appended', label: 'A', positionX: 0, positionY: 0 },
        { index: -2, kind: 'appended', label: 'B', positionX: 0, positionY: 0 },
      ],
      components: [],
    };
    expect(nextAppendedIndex(circuit)).toBe(-3);
  });
});

// ============================================================================
// formatComponentValue
// ============================================================================

describe('formatComponentValue', () => {
  it('formats zero value', () => {
    expect(formatComponentValue(0, 'Ω')).toBe('0 Ω');
  });

  it('formats picofarads', () => {
    expect(formatComponentValue(1e-12, 'F')).toContain('pF');
  });

  it('formats nanohenries', () => {
    expect(formatComponentValue(1e-9, 'H')).toContain('nH');
  });

  it('formats microfarads', () => {
    expect(formatComponentValue(1e-6, 'F')).toContain('µF');
  });

  it('formats milliohms', () => {
    expect(formatComponentValue(1e-3, 'Ω')).toContain('mΩ');
  });

  it('formats ohms', () => {
    expect(formatComponentValue(50, 'Ω')).toContain('Ω');
    expect(formatComponentValue(50, 'Ω')).toContain('50');
  });

  it('formats kilohms', () => {
    expect(formatComponentValue(1000, 'Ω')).toContain('kΩ');
  });

  it('formats megohms', () => {
    expect(formatComponentValue(1e6, 'Ω')).toContain('MΩ');
  });

  it('formats gigahertz', () => {
    expect(formatComponentValue(1e9, 'Hz')).toContain('GHz');
  });
});

// ============================================================================
// Constants & Labels
// ============================================================================

describe('COMPONENT_DEFAULTS', () => {
  it('has defaults for all 6 component types', () => {
    expect(Object.keys(COMPONENT_DEFAULTS)).toHaveLength(6);
    expect(COMPONENT_DEFAULTS.resistor.unit).toBe('Ω');
    expect(COMPONENT_DEFAULTS.inductor.unit).toBe('H');
    expect(COMPONENT_DEFAULTS.capacitor.unit).toBe('F');
    expect(COMPONENT_DEFAULTS.voltage_source.unit).toBe('V');
    expect(COMPONENT_DEFAULTS.current_source.unit).toBe('A');
    expect(COMPONENT_DEFAULTS.port.unit).toBe('Ω');
  });
});

describe('COMPONENT_TYPE_LABELS', () => {
  it('has labels for all 6 component types', () => {
    expect(Object.keys(COMPONENT_TYPE_LABELS)).toHaveLength(6);
    expect(COMPONENT_TYPE_LABELS.resistor).toBe('Resistor');
    expect(COMPONENT_TYPE_LABELS.port).toBe('Port');
  });
});
