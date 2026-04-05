/**
 * Tests for the auto-layout utility that positions circuit nodes
 * using dagre's graph layout algorithm.
 */
import { describe, it, expect } from 'vitest';
import type { CircuitNode, CircuitComponent } from '@/types/circuitTypes';
import { computeAutoLayout } from '../autoLayout';

// ============================================================================
// Helpers
// ============================================================================

function makeNode(
  index: number,
  kind: CircuitNode['kind'],
  label: string,
  x = 0,
  y = 0,
): CircuitNode {
  return { index, kind, label, positionX: x, positionY: y };
}

function makeComp(
  id: string,
  type: CircuitComponent['type'],
  nodeA: number,
  nodeB: number,
): CircuitComponent {
  return { id, type, nodeA, nodeB, value: 50, phase: 0, label: '' };
}

// ============================================================================
// Tests
// ============================================================================

describe('computeAutoLayout', () => {
  it('returns repositioned nodes without mutating input', () => {
    const nodes: CircuitNode[] = [
      makeNode(0, 'gnd', 'GND', 0, 0),
      makeNode(4, 'terminal', 'Feed 1', 0, 0),
      makeNode(5, 'terminal', 'Feed 2', 0, 0),
    ];
    const components: CircuitComponent[] = [
      makeComp('c1', 'voltage_source', 4, 0),
      makeComp('c2', 'resistor', 5, 0),
    ];

    const result = computeAutoLayout(nodes, components);

    // Should return same number of nodes
    expect(result).toHaveLength(nodes.length);
    // Should not mutate originals
    expect(nodes[0].positionX).toBe(0);
    expect(nodes[0].positionY).toBe(0);
    // Result nodes should have updated positions
    const gnd = result.find((n) => n.index === 0)!;
    const feed1 = result.find((n) => n.index === 4)!;
    expect(gnd).toBeDefined();
    expect(feed1).toBeDefined();
    // Positions should be numbers (not NaN)
    expect(Number.isFinite(gnd.positionX)).toBe(true);
    expect(Number.isFinite(gnd.positionY)).toBe(true);
  });

  it('places terminal nodes above GND', () => {
    const nodes: CircuitNode[] = [
      makeNode(0, 'gnd', 'GND'),
      makeNode(1, 'terminal', 'Feed 1'),
    ];
    const components: CircuitComponent[] = [
      makeComp('c1', 'voltage_source', 1, 0),
    ];

    const result = computeAutoLayout(nodes, components);

    const gnd = result.find((n) => n.index === 0)!;
    const feed = result.find((n) => n.index === 1)!;
    // Terminal should be above GND (smaller Y = higher on canvas)
    expect(feed.positionY).toBeLessThan(gnd.positionY);
  });

  it('handles empty nodes and components', () => {
    const result = computeAutoLayout([], []);
    expect(result).toEqual([]);
  });

  it('handles nodes with no connections', () => {
    const nodes: CircuitNode[] = [
      makeNode(0, 'gnd', 'GND'),
      makeNode(1, 'terminal', 'Feed 1'),
      makeNode(-1, 'appended', 'Aux 1'),
    ];
    const result = computeAutoLayout(nodes, []);
    expect(result).toHaveLength(3);
    // All positions should be finite numbers
    result.forEach((n) => {
      expect(Number.isFinite(n.positionX)).toBe(true);
      expect(Number.isFinite(n.positionY)).toBe(true);
    });
  });

  it('preserves node metadata (index, kind, label)', () => {
    const nodes: CircuitNode[] = [
      makeNode(0, 'gnd', 'GND'),
      makeNode(7, 'terminal', 'Feed 1'),
      makeNode(-2, 'appended', 'My Aux'),
    ];
    const components: CircuitComponent[] = [
      makeComp('c1', 'resistor', 7, -2),
      makeComp('c2', 'voltage_source', -2, 0),
    ];

    const result = computeAutoLayout(nodes, components);

    const gnd = result.find((n) => n.index === 0)!;
    expect(gnd.kind).toBe('gnd');
    expect(gnd.label).toBe('GND');

    const feed = result.find((n) => n.index === 7)!;
    expect(feed.kind).toBe('terminal');
    expect(feed.label).toBe('Feed 1');

    const aux = result.find((n) => n.index === -2)!;
    expect(aux.kind).toBe('appended');
    expect(aux.label).toBe('My Aux');
  });

  it('separates nodes horizontally for complex topologies', () => {
    // Three terminals all connected to GND — should spread horizontally
    const nodes: CircuitNode[] = [
      makeNode(0, 'gnd', 'GND'),
      makeNode(1, 'terminal', 'Feed 1'),
      makeNode(2, 'terminal', 'Feed 2'),
      makeNode(3, 'terminal', 'Feed 3'),
    ];
    const components: CircuitComponent[] = [
      makeComp('c1', 'voltage_source', 1, 0),
      makeComp('c2', 'resistor', 2, 0),
      makeComp('c3', 'capacitor', 3, 0),
    ];

    const result = computeAutoLayout(nodes, components);

    const feeds = result.filter((n) => n.kind === 'terminal');
    // Not all terminal nodes should be at the same X
    const xValues = new Set(feeds.map((n) => Math.round(n.positionX)));
    expect(xValues.size).toBeGreaterThanOrEqual(2);
  });
});
