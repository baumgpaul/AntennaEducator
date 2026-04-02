/**
 * Custom React Flow edge types for circuit components.
 *
 * Each edge represents a circuit component (R, L, C, V, I) and
 * renders its schematic symbol + value label on the connection.
 */
import React, { memo } from 'react';
import {
  getBezierPath,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react';
import { Box, Typography } from '@mui/material';
import type { CircuitComponentType } from '@/types/circuitTypes';
import { COMPONENT_DEFAULTS, formatComponentValue } from '@/types/circuitTypes';

// ============================================================================
// Edge data type
// ============================================================================

export interface CircuitEdgeData {
  componentType: CircuitComponentType;
  value: number;
  phase: number;
  label: string;
  onEdit?: (edgeId: string) => void;
  onDelete?: (edgeId: string) => void;
  /** Offset for parallel edges between same node pair (-1, 0, 1, ...) */
  parallelOffset?: number;
}

// ============================================================================
// Component color map
// ============================================================================

const COMPONENT_COLORS: Record<CircuitComponentType, string> = {
  resistor: '#ff9800',
  inductor: '#2196f3',
  capacitor: '#4caf50',
  voltage_source: '#f44336',
  current_source: '#e91e63',
};

// ============================================================================
// SVG schematic symbols (inline, small)
// ============================================================================

function SchematicIcon({ type, size = 16 }: { type: CircuitComponentType; size?: number }) {
  const color = COMPONENT_COLORS[type];
  const half = size / 2;
  const s = size;

  switch (type) {
    case 'resistor':
      // Zigzag resistor
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <polyline
            points="0,8 2,4 4,12 6,4 8,12 10,4 12,12 14,8 16,8"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case 'inductor':
      // Coil
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path
            d="M0,10 C2,2 4,2 6,10 C8,2 10,2 12,10 C14,2 16,2 16,10"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        </svg>
      );
    case 'capacitor':
      // Parallel plates
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <line x1="0" y1={half} x2="6" y2={half} stroke={color} strokeWidth={1.5} />
          <line x1="6" y1="2" x2="6" y2="14" stroke={color} strokeWidth={2} />
          <line x1="10" y1="2" x2="10" y2="14" stroke={color} strokeWidth={2} />
          <line x1="10" y1={half} x2="16" y2={half} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case 'voltage_source':
      // Circle with +/-
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx={half} cy={half} r={half - 1} fill="none" stroke={color} strokeWidth={1.5} />
          <text x="3" y="10" fontSize="8" fill={color} fontWeight="bold">V</text>
        </svg>
      );
    case 'current_source':
      // Circle with arrow
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx={half} cy={half} r={half - 1} fill="none" stroke={color} strokeWidth={1.5} />
          <text x="4" y="10" fontSize="8" fill={color} fontWeight="bold">I</text>
        </svg>
      );
  }
}

// ============================================================================
// Circuit Edge Component
// ============================================================================

const CircuitEdgeComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}) => {
  const edgeData = data as unknown as CircuitEdgeData;
  const color = COMPONENT_COLORS[edgeData.componentType];
  const defaults = COMPONENT_DEFAULTS[edgeData.componentType];
  const offset = edgeData.parallelOffset ?? 0;

  // Offset the control points perpendicular to the edge direction
  // to separate parallel edges visually
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const perpX = (-dy / len) * offset * 40;
  const perpY = (dx / len) * offset * 40;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sourceX + perpX * 0.3,
    sourceY: sourceY + perpY * 0.3,
    targetX: targetX + perpX * 0.3,
    targetY: targetY + perpY * 0.3,
    sourcePosition,
    targetPosition,
    curvature: 0.25 + Math.abs(offset) * 0.15,
  });

  const valueStr = formatComponentValue(edgeData.value, defaults.unit);
  const phaseStr = edgeData.phase !== 0
    ? ` ∠${edgeData.phase.toFixed(0)}°`
    : '';

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={selected ? '#fff' : color}
        strokeWidth={selected ? 3 : 2}
        style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
      />

      <EdgeLabelRenderer>
        <Box
          sx={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: '#1e1e2e',
            border: `1px solid ${color}40`,
            borderRadius: 0.5,
            px: 0.75,
            py: 0.25,
            cursor: 'pointer',
            '&:hover': {
              bgcolor: '#2a2a3e',
              border: `1px solid ${color}80`,
            },
          }}
          onClick={() => edgeData.onEdit?.(id)}
        >
          <SchematicIcon type={edgeData.componentType} size={14} />
          <Typography
            variant="caption"
            sx={{
              color: '#e0e0e0',
              fontSize: '0.65rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {defaults.symbol}: {valueStr}{phaseStr}
          </Typography>
          {edgeData.label && (
            <Typography
              variant="caption"
              sx={{ color: '#888', fontSize: '0.6rem', ml: 0.25 }}
            >
              ({edgeData.label})
            </Typography>
          )}
        </Box>
      </EdgeLabelRenderer>
    </>
  );
};

export const CircuitEdgeType = memo(CircuitEdgeComponent);

// ============================================================================
// Edge type map for ReactFlow
// ============================================================================

export const circuitEdgeTypes = {
  circuitEdge: CircuitEdgeType,
};
