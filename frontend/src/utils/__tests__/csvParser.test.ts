/**
 * TDD tests for the custom antenna CSV parser.
 *
 * CSV format (combined single-file):
 *   # NODES
 *   N, id, x, y, z [, radius]
 *   # EDGES
 *   E, node_start, node_end [, radius]
 *
 * Comments (#) and blank lines are ignored.
 * Comma-delimited only.
 */
import { describe, expect, it } from 'vitest';

import {
  type CsvParseResult,
  type ParsedEdge,
  type ParsedNode,
  parseCustomAntennaCSV,
} from '../csvParser';

// ===========================================================================
// Happy-path parsing
// ===========================================================================

describe('parseCustomAntennaCSV — happy path', () => {
  it('parses minimal valid CSV (2 nodes, 1 edge)', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 0, 0, 0.5
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.nodes[0]).toEqual({ id: 1, x: 0, y: 0, z: 0, radius: 0.001 });
    expect(result.nodes[1]).toEqual({ id: 2, x: 0, y: 0, z: 0.5, radius: 0.001 });
    expect(result.edges[0]).toEqual({ node_start: 1, node_end: 2 });
  });

  it('parses node with explicit radius', () => {
    const csv = `
N, 1, 0, 0, 0, 0.005
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes[0].radius).toBe(0.005);
    expect(result.nodes[1].radius).toBe(0.001); // default
  });

  it('parses edge with explicit radius', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 2, 0.003
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.edges[0]).toEqual({ node_start: 1, node_end: 2, radius: 0.003 });
  });

  it('ignores comment lines', () => {
    const csv = `
# This is a comment
N, 1, 0, 0, 0
# Another comment
N, 2, 0, 0, 0.5
# Edges section
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('ignores blank lines', () => {
    const csv = `
N, 1, 0, 0, 0

N, 2, 0, 0, 0.5

E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
  });

  it('handles whitespace around values', () => {
    const csv = `
N ,  1 ,  0.0 ,  0.0 ,  0.0
N ,  2 ,  1.0 ,  0.0 ,  0.0
E ,  1 ,  2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes[0]).toEqual({ id: 1, x: 0, y: 0, z: 0, radius: 0.001 });
  });

  it('parses large geometry (10 nodes, 9 edges)', () => {
    const lines: string[] = [];
    for (let i = 1; i <= 10; i++) {
      lines.push(`N, ${i}, ${i * 0.1}, 0, 0`);
    }
    for (let i = 1; i < 10; i++) {
      lines.push(`E, ${i}, ${i + 1}`);
    }
    const result = parseCustomAntennaCSV(lines.join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(10);
    expect(result.edges).toHaveLength(9);
  });

  it('handles mixed N/E ordering', () => {
    const csv = `
N, 1, 0, 0, 0
E, 1, 2
N, 2, 1, 0, 0
`.trim();
    const result = parseCustomAntennaCSV(csv);

    // Parser collects all N and E lines regardless of order
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    // Validation of edge refs happens separately
  });

  it('is case-insensitive for line prefix', () => {
    const csv = `
n, 1, 0, 0, 0
n, 2, 1, 0, 0
e, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('parses negative coordinates', () => {
    const csv = `
N, 1, -0.5, -1.0, -2.0
N, 2, 0.5, 1.0, 2.0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes[0]).toEqual({ id: 1, x: -0.5, y: -1.0, z: -2.0, radius: 0.001 });
  });

  it('parses scientific notation coordinates', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 0, 0, 5e-2
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes[1].z).toBeCloseTo(0.05);
  });
});

// ===========================================================================
// Validation / error cases
// ===========================================================================

describe('parseCustomAntennaCSV — validation errors', () => {
  it('reports error for duplicate node IDs', () => {
    const csv = `
N, 1, 0, 0, 0
N, 1, 1, 0, 0
E, 1, 1
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Dd]uplicate/.test(e))).toBe(true);
  });

  it('reports error for edge referencing non-existent node', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 99
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /node/.test(e))).toBe(true);
  });

  it('reports error for self-loop edge', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 1
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Ss]elf/.test(e))).toBe(true);
  });

  it('reports error for duplicate edges', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 2
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Dd]uplicate/.test(e))).toBe(true);
  });

  it('reports error for reverse duplicate edges', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 2
E, 2, 1
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Dd]uplicate/.test(e))).toBe(true);
  });

  it('reports error for non-numeric node coordinate', () => {
    const csv = `
N, 1, abc, 0, 0
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for non-integer node ID', () => {
    const csv = `
N, 1.5, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for missing fields in node line', () => {
    const csv = `
N, 1, 0, 0
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for missing fields in edge line', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for NaN coordinate', () => {
    const csv = `
N, 1, NaN, 0, 0
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for Infinity coordinate', () => {
    const csv = `
N, 1, Infinity, 0, 0
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for non-positive node ID', () => {
    const csv = `
N, 0, 0, 0, 0
N, 2, 1, 0, 0
E, 0, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for negative radius', () => {
    const csv = `
N, 1, 0, 0, 0, -0.001
N, 2, 1, 0, 0
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports error for negative edge radius', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
E, 1, 2, -0.001
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Warnings
// ===========================================================================

describe('parseCustomAntennaCSV — warnings', () => {
  it('warns about disconnected components', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
N, 3, 10, 0, 0
N, 4, 11, 0, 0
E, 1, 2
E, 3, 4
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /disconnect/i.test(w) || /component/i.test(w))).toBe(true);
  });

  it('no warning for connected graph', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
N, 3, 2, 0, 0
E, 1, 2
E, 2, 3
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((w) => /disconnect/i.test(w))).toEqual([]);
  });

  it('warns about unrecognised line prefix', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
X, something, else
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /[Uu]nrecogni[sz]ed|[Ii]gnor/.test(w))).toBe(true);
  });
});

// ===========================================================================
// Edge cases
// ===========================================================================

describe('parseCustomAntennaCSV — edge cases', () => {
  it('returns empty result for empty string', () => {
    const result = parseCustomAntennaCSV('');

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    // Should have an error about no nodes/edges
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty result for comments-only input', () => {
    const csv = `
# Only comments
# Nothing here
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles Windows line endings (\\r\\n)', () => {
    const csv = 'N, 1, 0, 0, 0\r\nN, 2, 1, 0, 0\r\nE, 1, 2';
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('handles trailing newline', () => {
    const csv = 'N, 1, 0, 0, 0\nN, 2, 1, 0, 0\nE, 1, 2\n';
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors).toEqual([]);
    expect(result.nodes).toHaveLength(2);
  });

  it('nodes-only (no edges) produces error', () => {
    const csv = `
N, 1, 0, 0, 0
N, 2, 1, 0, 0
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Ee]dge/.test(e))).toBe(true);
  });

  it('edges-only (no nodes) produces error', () => {
    const csv = `
E, 1, 2
`.trim();
    const result = parseCustomAntennaCSV(csv);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /[Nn]ode/.test(e))).toBe(true);
  });
});
