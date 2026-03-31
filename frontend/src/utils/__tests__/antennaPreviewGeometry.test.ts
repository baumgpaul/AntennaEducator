import { describe, it, expect } from 'vitest';
import {
  computeDipolePreview,
  computeLoopPreview,
  computeRodPreview,
} from '../antennaPreviewGeometry';

describe('computeDipolePreview', () => {
  it('generates correct number of nodes and edges for simple dipole', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0.01,
      segments: 20,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    expect(result.nodes.length).toBeGreaterThanOrEqual(4);
    expect(result.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('places nodes along z-axis for z-orientation', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0,
      segments: 2,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    // All nodes should have x=0, y=0 (along z-axis)
    for (const node of result.nodes) {
      expect(node.x).toBeCloseTo(0, 6);
      expect(node.y).toBeCloseTo(0, 6);
    }
  });

  it('returns empty for zero length', () => {
    const result = computeDipolePreview({
      length: 0,
      radius: 0.001,
      gap: 0,
      segments: 10,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('assigns unique node IDs', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0.01,
      segments: 10,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    const ids = result.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('creates a gap between arms', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0.1,
      segments: 10,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    // Find the two nodes closest to center (gap endpoints)
    const sorted = [...result.nodes].sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
    // Gap endpoints should be at approximately ±0.05
    expect(Math.abs(sorted[0].z)).toBeGreaterThan(0.01);
  });

  it('applies position offset', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0,
      segments: 2,
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    for (const node of result.nodes) {
      expect(node.x).toBeCloseTo(1, 6);
      expect(node.y).toBeCloseTo(2, 6);
    }
  });

  it('handles x-axis orientation', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0,
      segments: 2,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 1, y: 0, z: 0 },
    });

    for (const node of result.nodes) {
      expect(node.y).toBeCloseTo(0, 6);
      expect(node.z).toBeCloseTo(0, 6);
    }
  });

  it('edges reference valid node IDs', () => {
    const result = computeDipolePreview({
      length: 1.0,
      radius: 0.001,
      gap: 0.01,
      segments: 20,
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
    });

    const ids = new Set(result.nodes.map((n) => n.id));
    for (const edge of result.edges) {
      expect(ids.has(edge.node_start)).toBe(true);
      expect(ids.has(edge.node_end)).toBe(true);
    }
  });
});

describe('computeLoopPreview', () => {
  it('generates correct segment count', () => {
    const result = computeLoopPreview({
      radius: 0.1,
      wireRadius: 0.001,
      segments: 16,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });

    expect(result.nodes).toHaveLength(16);
    expect(result.edges).toHaveLength(16); // closed loop
  });

  it('creates nodes in a circle', () => {
    const result = computeLoopPreview({
      radius: 1.0,
      wireRadius: 0.001,
      segments: 8,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });

    // All nodes should be at distance ~1.0 from origin (in XY plane)
    for (const node of result.nodes) {
      const dist = Math.sqrt(node.x ** 2 + node.y ** 2);
      expect(dist).toBeCloseTo(1.0, 5);
      expect(node.z).toBeCloseTo(0, 10);
    }
  });

  it('returns empty for zero radius', () => {
    const result = computeLoopPreview({
      radius: 0,
      wireRadius: 0.001,
      segments: 8,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });
    expect(result.nodes).toHaveLength(0);
  });

  it('returns empty for too few segments', () => {
    const result = computeLoopPreview({
      radius: 0.1,
      wireRadius: 0.001,
      segments: 2,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });
    expect(result.nodes).toHaveLength(0);
  });

  it('applies position offset', () => {
    const result = computeLoopPreview({
      radius: 0.1,
      wireRadius: 0.001,
      segments: 8,
      position: { x: 5, y: 10, z: 15 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });

    const avgX = result.nodes.reduce((s, n) => s + n.x, 0) / result.nodes.length;
    const avgY = result.nodes.reduce((s, n) => s + n.y, 0) / result.nodes.length;
    const avgZ = result.nodes.reduce((s, n) => s + n.z, 0) / result.nodes.length;

    expect(avgX).toBeCloseTo(5, 3);
    expect(avgY).toBeCloseTo(10, 3);
    expect(avgZ).toBeCloseTo(15, 3);
  });

  it('applies rotation', () => {
    // Rotate 90° around X → loop normal goes from Z to Y
    const result = computeLoopPreview({
      radius: 1.0,
      wireRadius: 0.001,
      segments: 8,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 90, rotY: 0, rotZ: 0 },
    });

    // After 90° X rotation, original XY circle becomes XZ circle
    // All nodes should have y ≈ 0 and be in XZ plane
    for (const node of result.nodes) {
      const dist = Math.sqrt(node.x ** 2 + node.y ** 2 + node.z ** 2);
      expect(dist).toBeCloseTo(1.0, 4);
    }
  });

  it('edges form a closed loop', () => {
    const result = computeLoopPreview({
      radius: 0.1,
      wireRadius: 0.001,
      segments: 6,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });

    // Last edge should connect back to first node
    const lastEdge = result.edges[result.edges.length - 1];
    expect(lastEdge.node_end).toBe(1);
  });

  it('assigns unique node IDs starting at 1', () => {
    const result = computeLoopPreview({
      radius: 0.1,
      wireRadius: 0.001,
      segments: 8,
      position: { x: 0, y: 0, z: 0 },
      orientation: { rotX: 0, rotY: 0, rotZ: 0 },
    });

    const ids = result.nodes.map((n) => n.id);
    expect(ids[0]).toBe(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('computeRodPreview', () => {
  it('generates correct number of nodes and edges', () => {
    const result = computeRodPreview({
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 0, end_y: 0, end_z: 1,
      radius: 0.001,
      segments: 5,
    });

    expect(result.nodes).toHaveLength(6); // segments + 1
    expect(result.edges).toHaveLength(5);
  });

  it('interpolates nodes linearly', () => {
    const result = computeRodPreview({
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 1, end_y: 0, end_z: 0,
      radius: 0.001,
      segments: 4,
    });

    expect(result.nodes[0].x).toBeCloseTo(0, 6);
    expect(result.nodes[1].x).toBeCloseTo(0.25, 6);
    expect(result.nodes[2].x).toBeCloseTo(0.5, 6);
    expect(result.nodes[3].x).toBeCloseTo(0.75, 6);
    expect(result.nodes[4].x).toBeCloseTo(1.0, 6);
  });

  it('returns empty for zero-length rod', () => {
    const result = computeRodPreview({
      start_x: 1, start_y: 2, start_z: 3,
      end_x: 1, end_y: 2, end_z: 3,
      radius: 0.001,
      segments: 5,
    });
    expect(result.nodes).toHaveLength(0);
  });

  it('assigns sequential node IDs', () => {
    const result = computeRodPreview({
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 1, end_y: 1, end_z: 1,
      radius: 0.001,
      segments: 3,
    });

    expect(result.nodes.map((n) => n.id)).toEqual([1, 2, 3, 4]);
  });

  it('edges reference consecutive IDs', () => {
    const result = computeRodPreview({
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 1, end_y: 0, end_z: 0,
      radius: 0.001,
      segments: 3,
    });

    expect(result.edges).toEqual([
      { node_start: 1, node_end: 2 },
      { node_start: 2, node_end: 3 },
      { node_start: 3, node_end: 4 },
    ]);
  });

  it('handles diagonal rod', () => {
    const result = computeRodPreview({
      start_x: 0, start_y: 0, start_z: 0,
      end_x: 1, end_y: 1, end_z: 1,
      radius: 0.001,
      segments: 2,
    });

    expect(result.nodes).toHaveLength(3);
    const mid = result.nodes[1];
    expect(mid.x).toBeCloseTo(0.5, 6);
    expect(mid.y).toBeCloseTo(0.5, 6);
    expect(mid.z).toBeCloseTo(0.5, 6);
  });
});
