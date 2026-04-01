/**
 * CSV parser for custom antenna geometry definitions.
 *
 * Supported format (combined single-file, comma-delimited):
 *
 *   # Comments start with '#'
 *   N, id, x, y, z [, P]           — node definition (optional trailing P marks as port)
 *   E, node_start, node_end [, radius]  — edge definition (radius defaults to 0.001)
 *
 * Lines are case-insensitive for the prefix (N/n, E/e).
 * Blank lines and comment lines are skipped.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ParsedNode {
  id: number;
  x: number;
  y: number;
  z: number;
  isPort: boolean;
}

export interface ParsedEdge {
  node_start: number;
  node_end: number;
  radius?: number;
}

export interface CsvParseResult {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isFiniteNum(v: number): boolean {
  return Number.isFinite(v);
}

function parseNodeLine(fields: string[], lineNum: number, errors: string[]): ParsedNode | null {
  // Expected: N, id, x, y, z [, P]
  if (fields.length < 5) {
    errors.push(`Line ${lineNum}: Node requires at least 5 fields (N, id, x, y, z), got ${fields.length}`);
    return null;
  }

  const id = Number(fields[1]);
  if (!Number.isInteger(id)) {
    errors.push(`Line ${lineNum}: Node ID must be an integer, got '${fields[1].trim()}'`);
    return null;
  }
  if (id <= 0) {
    errors.push(`Line ${lineNum}: Node ID must be positive, got ${id}`);
    return null;
  }

  const x = Number(fields[2]);
  const y = Number(fields[3]);
  const z = Number(fields[4]);

  if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(z)) {
    errors.push(`Line ${lineNum}: Node coordinates must be finite numbers`);
    return null;
  }

  // Check for port flag (trailing P)
  let isPort = false;
  if (fields.length >= 6) {
    const flag = fields[5].trim().toUpperCase();
    if (flag === 'P' || flag === 'PORT') {
      isPort = true;
    } else if (flag !== '') {
      // It might be an old-style radius — warn and ignore
      const maybeNum = Number(flag);
      if (isFiniteNum(maybeNum)) {
        // Legacy radius field — ignore silently
      } else {
        errors.push(`Line ${lineNum}: Unrecognized node field '${fields[5].trim()}' (use P for port)`);
        return null;
      }
    }
  }

  return { id, x, y, z, isPort };
}

function parseEdgeLine(fields: string[], lineNum: number, errors: string[]): ParsedEdge | null {
  // Expected: E, node_start, node_end [, radius]
  if (fields.length < 3) {
    errors.push(`Line ${lineNum}: Edge requires at least 3 fields (E, start, end), got ${fields.length}`);
    return null;
  }

  const nodeStart = Number(fields[1]);
  const nodeEnd = Number(fields[2]);

  if (!Number.isInteger(nodeStart) || !Number.isInteger(nodeEnd)) {
    errors.push(`Line ${lineNum}: Edge node references must be integers`);
    return null;
  }

  const edge: ParsedEdge = { node_start: nodeStart, node_end: nodeEnd };

  if (fields.length >= 4 && fields[3].trim() !== '') {
    const radius = Number(fields[3]);
    if (!isFiniteNum(radius) || radius <= 0) {
      errors.push(`Line ${lineNum}: Edge radius must be a positive number, got '${fields[3].trim()}'`);
      return null;
    }
    edge.radius = radius;
  }

  return edge;
}

function checkConnectivity(nodes: ParsedNode[], edges: ParsedEdge[]): string | null {
  if (nodes.length <= 1) return null;

  const adj = new Map<number, Set<number>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.node_start)?.add(e.node_end);
    adj.get(e.node_end)?.add(e.node_start);
  }

  const visited = new Set<number>();
  const stack = [nodes[0].id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const nb of adj.get(cur) ?? []) {
      if (!visited.has(nb)) stack.push(nb);
    }
  }

  if (visited.size < nodes.length) {
    const nComponents = countComponents(nodes, adj);
    return `Geometry has ${nComponents} disconnected components (expected 1 connected graph)`;
  }
  return null;
}

function countComponents(nodes: ParsedNode[], adj: Map<number, Set<number>>): number {
  const remaining = new Set(nodes.map((n) => n.id));
  let count = 0;
  while (remaining.size > 0) {
    const seed = remaining.values().next().value!;
    const stack = [seed];
    const comp = new Set<number>();
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (comp.has(cur)) continue;
      comp.add(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!comp.has(nb)) stack.push(nb);
      }
    }
    for (const id of comp) remaining.delete(id);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseCustomAntennaCSV(csv: string): CsvParseResult {
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const lines = csv.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i].trim();

    // Skip blank and comment lines
    if (raw === '' || raw.startsWith('#')) continue;

    const fields = raw.split(',');
    const prefix = fields[0].trim().toUpperCase();

    if (prefix === 'N') {
      const node = parseNodeLine(fields, lineNum, errors);
      if (node) nodes.push(node);
    } else if (prefix === 'E') {
      const edge = parseEdgeLine(fields, lineNum, errors);
      if (edge) edges.push(edge);
    } else {
      warnings.push(`Line ${lineNum}: Unrecognised prefix '${fields[0].trim()}', ignoring`);
    }
  }

  // --- structural validation ---

  if (nodes.length === 0) {
    errors.push('No nodes found in CSV');
  }
  if (edges.length === 0) {
    errors.push('No edges found in CSV');
  }

  // Duplicate node IDs
  const nodeIds = new Set<number>();
  for (const n of nodes) {
    if (nodeIds.has(n.id)) {
      errors.push(`Duplicate node ID: ${n.id}`);
    }
    nodeIds.add(n.id);
  }

  // Edge validation
  const seenEdgePairs = new Set<string>();
  for (const e of edges) {
    if (e.node_start === e.node_end) {
      errors.push(`Self-loop edge: node ${e.node_start} connects to itself`);
      continue;
    }
    if (!nodeIds.has(e.node_start)) {
      errors.push(`Edge references non-existent node ${e.node_start}`);
    }
    if (!nodeIds.has(e.node_end)) {
      errors.push(`Edge references non-existent node ${e.node_end}`);
    }
    const canonical = [Math.min(e.node_start, e.node_end), Math.max(e.node_start, e.node_end)].join('-');
    if (seenEdgePairs.has(canonical)) {
      errors.push(`Duplicate edge between nodes ${Math.min(e.node_start, e.node_end)} and ${Math.max(e.node_start, e.node_end)}`);
    }
    seenEdgePairs.add(canonical);
  }

  // Connectivity (only warn, don't error)
  if (errors.length === 0 && nodes.length > 0 && edges.length > 0) {
    const connWarning = checkConnectivity(nodes, edges);
    if (connWarning) warnings.push(connWarning);
  }

  return { nodes, edges, warnings, errors };
}
