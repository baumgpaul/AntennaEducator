/**
 * Custom React Flow edge types for circuit components.
 *
 * Each edge represents a circuit component (R, L, C, V, I) and
 * renders its schematic symbol + value label on the connection.
 */
import React, { memo, useRef, useState, useCallback } from 'react';
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
  // Use wider viewBox for better detail; render at given height
  const w = Math.round(size * 1.5);
  const h = size;

  switch (type) {
    case 'resistor':
      // IEEE zigzag resistor with lead wires
      return (
        <svg width={w} height={h} viewBox="0 0 24 12">
          <path
            d="M0,6 L4,6 L5.5,1 L8.5,11 L11.5,1 L14.5,11 L17.5,1 L20,6 L24,6"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'inductor':
      // IEEE coil — three semicircular humps
      return (
        <svg width={w} height={h} viewBox="0 0 24 14">
          <path
            d="M0,11 L3,11 A3,3 0 0,1 9,11 A3,3 0 0,1 15,11 A3,3 0 0,1 21,11 L24,11"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'capacitor':
      // IEEE capacitor — two parallel plates with lead wires
      return (
        <svg width={w} height={h} viewBox="0 0 24 12">
          <line x1="0" y1="6" x2="10" y2="6" stroke={color} strokeWidth={1.5} />
          <line x1="10" y1="1" x2="10" y2="11" stroke={color} strokeWidth={2} />
          <line x1="14" y1="1" x2="14" y2="11" stroke={color} strokeWidth={2} />
          <line x1="14" y1="6" x2="24" y2="6" stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case 'voltage_source':
      // IEEE independent voltage source — circle with + and − polarity marks
      return (
        <svg width={w} height={h} viewBox="0 0 24 16">
          <line x1="0" y1="8" x2="7" y2="8" stroke={color} strokeWidth={1.5} />
          <circle cx="12" cy="8" r="5" fill="none" stroke={color} strokeWidth={1.5} />
          {/* Plus sign */}
          <line x1="9" y1="8" x2="11" y2="8" stroke={color} strokeWidth={1.2} />
          <line x1="10" y1="7" x2="10" y2="9" stroke={color} strokeWidth={1.2} />
          {/* Minus sign */}
          <line x1="13" y1="8" x2="15" y2="8" stroke={color} strokeWidth={1.2} />
          <line x1="17" y1="8" x2="24" y2="8" stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case 'current_source':
      // IEEE independent current source — circle with directional arrow
      return (
        <svg width={w} height={h} viewBox="0 0 24 16">
          <line x1="0" y1="8" x2="7" y2="8" stroke={color} strokeWidth={1.5} />
          <circle cx="12" cy="8" r="5" fill="none" stroke={color} strokeWidth={1.5} />
          {/* Arrow pointing right inside circle */}
          <line x1="9" y1="8" x2="15" y2="8" stroke={color} strokeWidth={1.5} />
          <polyline
            points="13,5.5 15,8 13,10.5"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          <line x1="17" y1="8" x2="24" y2="8" stroke={color} strokeWidth={1.5} />
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

  // For parallel edges, compute a curved detour via a midpoint offset
  // perpendicular to the straight line between source and target
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Perpendicular unit vector
  const perpX = -dy / len;
  const perpY = dx / len;
  // Midpoint
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (offset === 0) {
    // Straight bezier for the primary (or only) edge
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      curvature: 0.25,
    });
  } else {
    // Offset edge: route through a control point perpendicular to the line
    const detour = offset * 60; // 60px separation per parallel index
    const cpX = midX + perpX * detour;
    const cpY = midY + perpY * detour;
    edgePath = `M ${sourceX} ${sourceY} Q ${cpX} ${cpY} ${targetX} ${targetY}`;
    // Place label at the apex of the curve (the control point projected onto the curve)
    labelX = midX + perpX * detour * 0.5;
    labelY = midY + perpY * detour * 0.5;
  }

  const valueStr = formatComponentValue(edgeData.value, defaults.unit);
  const phaseStr = edgeData.phase !== 0
    ? ` ∠${edgeData.phase.toFixed(0)}°`
    : '';

  // Draggable label offset (local to this edge instance)
  const [labelDragOffset, setLabelDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onLabelMouseDown = useCallback((e: React.MouseEvent) => {
    // Alt+left-click to drag the label
    if (e.altKey && e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = { x: e.clientX, y: e.clientY, ox: labelDragOffset.x, oy: labelDragOffset.y };
      const onMove = (me: MouseEvent) => {
        if (!dragStartRef.current) return;
        setLabelDragOffset({
          x: dragStartRef.current.ox + (me.clientX - dragStartRef.current.x),
          y: dragStartRef.current.oy + (me.clientY - dragStartRef.current.y),
        });
      };
      const onUp = () => {
        dragStartRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
  }, [labelDragOffset]);

  // Double-click resets label position
  const onLabelDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setLabelDragOffset({ x: 0, y: 0 });
  }, []);

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
            transform: `translate(-50%, -50%) translate(${labelX + labelDragOffset.x}px,${labelY + labelDragOffset.y}px)`,
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
            userSelect: 'none',
            '&:hover': {
              bgcolor: '#2a2a3e',
              border: `1px solid ${color}80`,
            },
          }}
          onClick={() => edgeData.onEdit?.(id)}
          onMouseDown={onLabelMouseDown}
          onDoubleClick={onLabelDoubleClick}
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
          <Box
            component="span"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              edgeData.onDelete?.(id);
            }}
            sx={{
              ml: 0.5,
              cursor: 'pointer',
              color: '#666',
              fontSize: '0.7rem',
              lineHeight: 1,
              '&:hover': { color: '#f44336' },
            }}
          >
            ×
          </Box>
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
