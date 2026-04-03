/**
 * Custom React Flow node types for the circuit editor.
 *
 * Three node kinds:
 * - Terminal: mesh nodes flagged as circuit connection points (blue)
 * - GND: ground/reference node, always present (green)
 * - Appended: user-created auxiliary nodes (orange)
 */
import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Typography } from '@mui/material';
import type { CircuitNodeKind } from '@/types/circuitTypes';

// ============================================================================
// Style constants
// ============================================================================

const NODE_STYLES: Record<CircuitNodeKind, { bg: string; border: string; text: string }> = {
  terminal: { bg: '#1a3a5c', border: '#4a9eff', text: '#e0e8f0' },
  gnd: { bg: '#1a3c1a', border: '#4caf50', text: '#d0e8d0' },
  appended: { bg: '#3c2a1a', border: '#ff9800', text: '#f0e0c0' },
};

const GND_SYMBOL_LINES = [
  // Classic 3-bar ground symbol
  { x1: -10, x2: 10, y: 0 },
  { x1: -6, x2: 6, y: 4 },
  { x1: -2, x2: 2, y: 8 },
];

// ============================================================================
// CircuitNodeData type
// ============================================================================

export interface CircuitNodeData {
  kind: CircuitNodeKind;
  label: string;
  index: number;
}

// ============================================================================
// Circuit Node Component
// ============================================================================

const CircuitNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as CircuitNodeData;
  const style = NODE_STYLES[nodeData.kind];

  return (
    <Box
      sx={{
        minWidth: 80,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: `2px solid ${selected ? '#fff' : style.border}`,
        bgcolor: style.bg,
        textAlign: 'center',
        cursor: 'grab',
        boxShadow: selected ? '0 0 8px rgba(255,255,255,0.3)' : '0 2px 4px rgba(0,0,0,0.3)',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': {
          boxShadow: '0 0 12px rgba(255,255,255,0.2)',
        },
      }}
    >
      {/* Single connector point — overlapping source+target handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        style={{ background: style.border, width: 10, height: 10, bottom: -5 }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="in"
        style={{ background: 'transparent', width: 10, height: 10, bottom: -5 }}
      />

      {/* GND symbol */}
      {nodeData.kind === 'gnd' && (
        <svg width="24" height="16" viewBox="-12 -2 24 14" style={{ display: 'block', margin: '0 auto 4px' }}>
          {GND_SYMBOL_LINES.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              x2={line.x2}
              y1={line.y}
              y2={line.y}
              stroke={style.border}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}

      <Typography
        variant="caption"
        sx={{
          color: style.text,
          fontWeight: 600,
          fontSize: '0.75rem',
          lineHeight: 1.2,
          display: 'block',
        }}
      >
        {nodeData.label}
      </Typography>

      <Typography
        variant="caption"
        sx={{
          color: `${style.text}80`,
          fontSize: '0.65rem',
          display: 'block',
        }}
      >
        {nodeData.kind === 'gnd' ? 'idx: 0' : `idx: ${nodeData.index}`}
      </Typography>
    </Box>
  );
};

export const CircuitNodeType = memo(CircuitNodeComponent);

// ============================================================================
// Node type map for ReactFlow
// ============================================================================

export const circuitNodeTypes = {
  circuitNode: CircuitNodeType,
};
