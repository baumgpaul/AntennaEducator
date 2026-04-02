/**
 * CircuitEditor — React Flow based circuit editor for antenna elements.
 *
 * Opens as a dialog, operates on a single antenna element at a time.
 * Replaces SourceDialog and LumpedElementDialog.
 *
 * Features:
 * - Drag-and-drop node positioning
 * - GND node always present
 * - Terminal nodes from mesh (circuit-eligible nodes)
 * - User-created appended nodes
 * - Component palette: R, L, C, Voltage Source, Current Source
 * - Inline component value editing
 * - Expression support via variable context
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node as RFNode,
  type Edge as RFEdge,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
  Typography,
  Box,
  Chip,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';

import { circuitNodeTypes, type CircuitNodeData } from './CircuitNodeTypes';
import { circuitEdgeTypes, type CircuitEdgeData } from './CircuitEdgeTypes';
import { ComponentEditDialog } from './ComponentEditDialog';
import type {
  CircuitState,
  CircuitComponent,
  CircuitNode,
  CircuitComponentType,
} from '@/types/circuitTypes';
import {
  backendToCircuit,
  circuitToBackend,
  nextAppendedIndex,
  COMPONENT_DEFAULTS,
  COMPONENT_TYPE_LABELS,
} from '@/types/circuitTypes';
import type { AntennaElement } from '@/types/models';

// ============================================================================
// Props
// ============================================================================

export interface CircuitEditorProps {
  open: boolean;
  onClose: () => void;
  /** Apply changes — receives sources + lumped_elements + appended_nodes */
  onApply: (data: {
    sources: ReturnType<typeof circuitToBackend>['sources'];
    lumped_elements: ReturnType<typeof circuitToBackend>['lumped_elements'];
    appended_nodes: Array<{ index: number; label: string }>;
  }) => void;
  /** The antenna element being edited */
  element: AntennaElement | null;
  /** Indices of mesh nodes flagged as terminal (connection points for circuits) */
  terminalNodeIndices: number[];
}

// ============================================================================
// Helpers: CircuitState ↔ ReactFlow nodes/edges
// ============================================================================

function circuitNodesToRF(cNodes: CircuitNode[]): RFNode[] {
  return cNodes.map((cn) => ({
    id: `node-${cn.index}`,
    type: 'circuitNode',
    position: { x: cn.positionX, y: cn.positionY },
    data: { kind: cn.kind, label: cn.label, index: cn.index } satisfies CircuitNodeData,
    // GND and terminal nodes are not deletable
    deletable: cn.kind === 'appended',
  }));
}

function circuitComponentsToRF(
  components: CircuitComponent[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
): RFEdge[] {
  return components.map((comp) => ({
    id: comp.id,
    source: `node-${comp.nodeA}`,
    target: `node-${comp.nodeB}`,
    sourceHandle: 'out',
    targetHandle: 'in',
    type: 'circuitEdge',
    data: {
      componentType: comp.type,
      value: comp.value,
      phase: comp.phase,
      label: comp.label,
      onEdit,
      onDelete,
    } satisfies CircuitEdgeData,
    deletable: true,
  }));
}

function rfNodesToCircuit(rfNodes: RFNode[]): CircuitNode[] {
  return rfNodes.map((rfn) => {
    const data = rfn.data as unknown as CircuitNodeData;
    return {
      index: data.index,
      kind: data.kind,
      label: data.label,
      positionX: rfn.position.x,
      positionY: rfn.position.y,
    };
  });
}

// ============================================================================
// Component Palette
// ============================================================================

const PALETTE_ITEMS: CircuitComponentType[] = [
  'resistor',
  'inductor',
  'capacitor',
  'voltage_source',
  'current_source',
];

const PALETTE_COLORS: Record<CircuitComponentType, string> = {
  resistor: '#ff9800',
  inductor: '#2196f3',
  capacitor: '#4caf50',
  voltage_source: '#f44336',
  current_source: '#e91e63',
};

// ============================================================================
// Main Component
// ============================================================================

export const CircuitEditor: React.FC<CircuitEditorProps> = ({
  open,
  onClose,
  onApply,
  element,
  terminalNodeIndices,
}) => {
  // Circuit state
  const [circuit, setCircuit] = useState<CircuitState>({ nodes: [], components: [] });
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  // Keep a ref to latest circuit so edge callbacks always see current data
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;

  // Component editing dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<CircuitComponent | null>(null);
  const [connectMode, setConnectMode] = useState<CircuitComponentType | null>(null);

  // Appended node label input
  const [newNodeLabel, setNewNodeLabel] = useState('');

  // Stable edge callbacks via refs (no stale closures)
  const handleEditComponent = useCallback(
    (edgeId: string) => {
      const comp = circuitRef.current.components.find((c) => c.id === edgeId);
      if (comp) {
        setEditingComponent(comp);
        setEditDialogOpen(true);
      }
    },
    [],
  );

  const handleDeleteComponent = useCallback(
    (edgeId: string) => {
      setRfEdges((edges) => edges.filter((e) => e.id !== edgeId));
      setCircuit((prev) => ({
        ...prev,
        components: prev.components.filter((c) => c.id !== edgeId),
      }));
    },
    [setRfEdges],
  );

  // Initialize circuit from element data
  useEffect(() => {
    if (!open || !element) return;

    const sources = element.sources ?? [];
    const lumpedElements = element.lumped_elements ?? [];

    // Get appended nodes from element (stored from previous circuit editor sessions)
    const existingAppended: Array<{ index: number; label: string }> =
      (element.appended_nodes ?? []).map((an) => ({ index: an.index, label: an.label }));

    // Also collect any negative node indices from sources/lumped elements not yet in appended_nodes
    const knownIndices = new Set(existingAppended.map((n) => n.index));
    for (const src of sources) {
      if (src.node_start != null && src.node_start < 0 && !knownIndices.has(src.node_start)) {
        existingAppended.push({ index: src.node_start, label: `Aux ${Math.abs(src.node_start)}` });
      }
      if (src.node_end != null && src.node_end < 0 && !knownIndices.has(src.node_end)) {
        existingAppended.push({ index: src.node_end, label: `Aux ${Math.abs(src.node_end)}` });
      }
    }
    for (const le of lumpedElements) {
      if (le.node_start < 0 && !knownIndices.has(le.node_start)) {
        existingAppended.push({ index: le.node_start, label: `Aux ${Math.abs(le.node_start)}` });
      }
      if (le.node_end < 0 && !knownIndices.has(le.node_end)) {
        existingAppended.push({ index: le.node_end, label: `Aux ${Math.abs(le.node_end)}` });
      }
    }

    const initial = backendToCircuit(
      sources, lumpedElements, terminalNodeIndices, existingAppended, element.mesh,
    );
    setCircuit(initial);

    // Convert to ReactFlow state
    setRfNodes(circuitNodesToRF(initial.nodes));
    setRfEdges(
      circuitComponentsToRF(initial.components, handleEditComponent, handleDeleteComponent),
    );
  }, [open, element, terminalNodeIndices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync circuit components when rfEdges change (deletions)
  const syncCircuitFromRF = useCallback(() => {
    const updatedNodes = rfNodesToCircuit(rfNodes);
    const componentIds = new Set(rfEdges.map((e) => e.id));
    const updatedComponents = circuit.components.filter((c) => componentIds.has(c.id));
    setCircuit({ nodes: updatedNodes, components: updatedComponents });
  }, [rfNodes, rfEdges, circuit.components]);

  // Handle new connection (drag from node to node)
  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const sourceIdx = parseInt(params.source.replace('node-', ''));
      const targetIdx = parseInt(params.target.replace('node-', ''));

      const compType = connectMode || 'resistor';
      const defaults = COMPONENT_DEFAULTS[compType];
      const newId = `comp-${Date.now()}`;

      const newComponent: CircuitComponent = {
        id: newId,
        type: compType,
        nodeA: sourceIdx,
        nodeB: targetIdx,
        value: defaults.value,
        phase: 0,
        label: '',
      };

      setCircuit((prev) => ({
        ...prev,
        components: [...prev.components, newComponent],
      }));

      const newEdge: RFEdge = {
        id: newId,
        source: params.source,
        target: params.target,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'circuitEdge',
        data: {
          componentType: compType,
          value: defaults.value,
          phase: 0,
          label: '',
          onEdit: handleEditComponent,
          onDelete: handleDeleteComponent,
        } satisfies CircuitEdgeData,
        deletable: true,
      };

      setRfEdges((edges) => [...edges, newEdge]);
    },
    [connectMode, handleEditComponent, handleDeleteComponent, setRfEdges],
  );

  // Add appended node
  const handleAddAppendedNode = useCallback(() => {
    const newIdx = nextAppendedIndex(circuit);
    const nodeLabel = newNodeLabel.trim() || `Aux ${Math.abs(newIdx)}`;

    const newNode: CircuitNode = {
      index: newIdx,
      kind: 'appended',
      label: nodeLabel,
      positionX: 250,
      positionY: 250,
    };

    setCircuit((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
    }));

    const rfNode: RFNode = {
      id: `node-${newIdx}`,
      type: 'circuitNode',
      position: { x: newNode.positionX, y: newNode.positionY },
      data: { kind: 'appended', label: nodeLabel, index: newIdx } satisfies CircuitNodeData,
      deletable: true,
    };

    setRfNodes((nodes) => [...nodes, rfNode]);
    setNewNodeLabel('');
  }, [circuit, newNodeLabel, setRfNodes]);

  // Open add component dialog
  const handleAddComponent = useCallback(() => {
    setEditingComponent(null);
    setEditDialogOpen(true);
  }, []);

  // Save component from edit dialog
  const handleSaveComponent = useCallback(
    (compData: Omit<CircuitComponent, 'id'> & { id?: string }) => {
      if (compData.id) {
        // Update existing
        setCircuit((prev) => ({
          ...prev,
          components: prev.components.map((c) =>
            c.id === compData.id ? { ...c, ...compData } as CircuitComponent : c,
          ),
        }));

        // Update RF edge
        setRfEdges((edges) =>
          edges.map((e) => {
            if (e.id === compData.id) {
              return {
                ...e,
                source: `node-${compData.nodeA}`,
                target: `node-${compData.nodeB}`,
                sourceHandle: 'out',
                targetHandle: 'in',
                data: {
                  componentType: compData.type,
                  value: compData.value,
                  phase: compData.phase,
                  label: compData.label,
                  onEdit: handleEditComponent,
                  onDelete: handleDeleteComponent,
                } satisfies CircuitEdgeData,
              };
            }
            return e;
          }),
        );
      } else {
        // Add new
        const newId = `comp-${Date.now()}`;
        const newComp: CircuitComponent = { ...compData, id: newId };

        setCircuit((prev) => ({
          ...prev,
          components: [...prev.components, newComp],
        }));

        const newEdge: RFEdge = {
          id: newId,
          source: `node-${compData.nodeA}`,
          target: `node-${compData.nodeB}`,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'circuitEdge',
          data: {
            componentType: compData.type,
            value: compData.value,
            phase: compData.phase,
            label: compData.label,
            onEdit: handleEditComponent,
            onDelete: handleDeleteComponent,
          } satisfies CircuitEdgeData,
          deletable: true,
        };

        setRfEdges((edges) => [...edges, newEdge]);
      }
    },
    [handleEditComponent, handleDeleteComponent, setRfEdges],
  );

  // Apply changes and close
  const handleApply = useCallback(() => {
    // Update node positions from final RF state
    const finalNodes = rfNodesToCircuit(rfNodes);
    const finalCircuit: CircuitState = { nodes: finalNodes, components: circuit.components };

    const { sources, lumped_elements } = circuitToBackend(finalCircuit);
    const appended_nodes = finalNodes
      .filter((n) => n.kind === 'appended')
      .map((n) => ({ index: n.index, label: n.label }));

    onApply({ sources, lumped_elements, appended_nodes });
    onClose();
  }, [rfNodes, circuit.components, onApply, onClose]);

  // Compute parallel edge offsets so overlapping edges are visually separated
  const rfEdgesWithOffsets = useMemo(() => {
    // Group edges by unordered node pair
    const pairMap = new Map<string, string[]>();
    for (const edge of rfEdges) {
      const nodes = [edge.source, edge.target].sort();
      const key = `${nodes[0]}||${nodes[1]}`;
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(edge.id);
    }

    // Assign offsets for groups with multiple edges
    const offsetMap = new Map<string, number>();
    for (const [, ids] of pairMap) {
      if (ids.length <= 1) {
        offsetMap.set(ids[0], 0);
      } else {
        const half = (ids.length - 1) / 2;
        ids.forEach((id, i) => offsetMap.set(id, i - half));
      }
    }

    return rfEdges.map((edge) => ({
      ...edge,
      data: {
        ...(edge.data as object),
        parallelOffset: offsetMap.get(edge.id) ?? 0,
      },
    }));
  }, [rfEdges]);

  // Component summary for the info panel
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const comp of circuit.components) {
      counts[comp.type] = (counts[comp.type] || 0) + 1;
    }
    return counts;
  }, [circuit.components]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: '90vw',
          height: '80vh',
          maxWidth: 1200,
          bgcolor: '#121218',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          Circuit Editor — {element?.name || 'Antenna'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {Object.entries(summary).map(([type, count]) => (
            <Chip
              key={type}
              size="small"
              label={`${COMPONENT_DEFAULTS[type as CircuitComponentType]?.symbol || type}: ${count}`}
              sx={{
                bgcolor: `${PALETTE_COLORS[type as CircuitComponentType] || '#666'}30`,
                color: PALETTE_COLORS[type as CircuitComponentType] || '#ccc',
                fontWeight: 600,
              }}
            />
          ))}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Left Toolbar */}
        <Box
          sx={{
            width: 200,
            bgcolor: '#1a1a24',
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            p: 1.5,
            gap: 1.5,
            overflow: 'auto',
          }}
        >
          {/* Connection Mode */}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Connect Mode
          </Typography>
          <ToggleButtonGroup
            orientation="vertical"
            value={connectMode}
            exclusive
            onChange={(_, val) => setConnectMode(val)}
            size="small"
            fullWidth
          >
            {PALETTE_ITEMS.map((t) => (
              <ToggleButton
                key={t}
                value={t}
                sx={{
                  justifyContent: 'flex-start',
                  gap: 1,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  color: '#ccc',
                  '&.Mui-selected': {
                    bgcolor: `${PALETTE_COLORS[t]}20`,
                    color: PALETTE_COLORS[t],
                    borderColor: PALETTE_COLORS[t],
                  },
                }}
              >
                <Chip
                  size="small"
                  label={COMPONENT_DEFAULTS[t].symbol}
                  sx={{
                    bgcolor: `${PALETTE_COLORS[t]}30`,
                    color: PALETTE_COLORS[t],
                    fontWeight: 700,
                    minWidth: 24,
                    height: 20,
                    fontSize: '0.65rem',
                  }}
                />
                {COMPONENT_TYPE_LABELS[t]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Divider sx={{ borderColor: '#333' }} />

          {/* Add Component Button */}
          <Button
            startIcon={<AddCircleOutlineIcon />}
            onClick={handleAddComponent}
            size="small"
            variant="outlined"
            fullWidth
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Add Component
          </Button>

          <Divider sx={{ borderColor: '#333' }} />

          {/* Add Appended Node */}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Auxiliary Nodes
          </Typography>
          <TextField
            size="small"
            placeholder="Node label"
            value={newNodeLabel}
            onChange={(e) => setNewNodeLabel(e.target.value)}
            sx={{
              '& .MuiInputBase-root': { fontSize: '0.75rem' },
            }}
          />
          <Button
            startIcon={<AddCircleOutlineIcon />}
            onClick={handleAddAppendedNode}
            size="small"
            variant="outlined"
            color="warning"
            fullWidth
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Add Aux Node
          </Button>

          <Divider sx={{ borderColor: '#333' }} />

          {/* Legend */}
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
            Legend
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: '2px solid #4a9eff', bgcolor: '#1a3a5c' }} />
              <Typography variant="caption" color="text.secondary">Terminal node</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: '2px solid #4caf50', bgcolor: '#1a3c1a' }} />
              <Typography variant="caption" color="text.secondary">GND (ref)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: '2px solid #ff9800', bgcolor: '#3c2a1a' }} />
              <Typography variant="caption" color="text.secondary">Auxiliary node</Typography>
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, lineHeight: 1.4 }}>
            Drag between nodes to connect. Select a component type first, then drag.
            Click edge label to edit. Press Delete to remove selected.
          </Typography>
        </Box>

        {/* React Flow Canvas */}
        <Box sx={{
          flex: 1,
          height: '100%',
          // Dark mode overrides for React Flow controls
          '& .react-flow__controls': {
            border: '1px solid #444',
          },
          '& .react-flow__controls-button': {
            background: '#1a1a24',
            borderBottom: '1px solid #333',
            fill: '#e0e0e0',
            color: '#e0e0e0',
            '&:hover': {
              background: '#2a2a3a',
            },
          },
          '& .react-flow__controls-button svg': {
            fill: '#e0e0e0',
          },
        }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdgesWithOffsets}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={circuitNodeTypes}
            edgeTypes={circuitEdgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: '#0d0d14' }}
            defaultEdgeOptions={{
              type: 'circuitEdge',
            }}
            connectionLineStyle={{
              stroke: connectMode ? PALETTE_COLORS[connectMode] : '#666',
              strokeWidth: 2,
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
            <Controls
              position="bottom-right"
              style={{
                background: '#1a1a24',
                borderColor: '#444',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              }}
              className="react-flow-dark-controls"
            />
            <MiniMap
              position="bottom-left"
              style={{ background: '#1a1a24' }}
              nodeColor={(node) => {
                const data = node.data as unknown as CircuitNodeData;
                if (data.kind === 'gnd') return '#4caf50';
                if (data.kind === 'appended') return '#ff9800';
                return '#4a9eff';
              }}
            />
          </ReactFlow>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5, borderTop: '1px solid #333' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {circuit.components.length} component{circuit.components.length !== 1 ? 's' : ''} ·{' '}
          {circuit.nodes.length} node{circuit.nodes.length !== 1 ? 's' : ''}
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleApply}
        >
          Apply
        </Button>
      </DialogActions>

      {/* Component Edit Dialog */}
      <ComponentEditDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingComponent(null);
        }}
        onSave={handleSaveComponent}
        nodes={circuit.nodes}
        editComponent={editingComponent}
      />
    </Dialog>
  );
};

export default CircuitEditor;
