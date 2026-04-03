/**
 * Auto-layout utility for the circuit editor.
 *
 * Uses dagre to compute a top-to-bottom directed graph layout
 * for circuit nodes, keeping terminal nodes at the top and GND
 * at the bottom.
 */
import dagre from '@dagrejs/dagre';
import type { CircuitNode, CircuitComponent } from '@/types/circuitTypes';

/** Node dimensions used by the layout algorithm (px). */
const NODE_WIDTH = 100;
const NODE_HEIGHT = 60;

/**
 * Compute auto-layout positions for circuit nodes using dagre.
 *
 * Returns new CircuitNode[] with updated positionX/positionY.
 * Does NOT mutate the input array.
 */
export function computeAutoLayout(
  nodes: CircuitNode[],
  components: CircuitComponent[],
): CircuitNode[] {
  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB', // top-to-bottom
    nodesep: 80,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes
  for (const node of nodes) {
    g.setNode(String(node.index), { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges (one per component)
  for (const comp of components) {
    g.setEdge(String(comp.nodeA), String(comp.nodeB));
  }

  dagre.layout(g);

  // Read back positions
  return nodes.map((node) => {
    const dagreNode = g.node(String(node.index));
    return {
      ...node,
      // dagre returns center coordinates; offset to top-left for React Flow
      positionX: dagreNode.x - NODE_WIDTH / 2,
      positionY: dagreNode.y - NODE_HEIGHT / 2,
    };
  });
}
