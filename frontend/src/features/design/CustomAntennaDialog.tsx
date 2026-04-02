import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Tabs,
  Tab,
  Alert,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  UploadFile as UploadFileIcon,
  ContentPaste as PasteIcon,
} from '@mui/icons-material';
import { useAppSelector } from '@/store/hooks';
import { selectVariableContextNumeric } from '@/store/variablesSlice';
import {
  BUILTIN_CONSTANTS,
  parseNumericOrExpression,
} from '@/utils/expressionEvaluator';
import { parseCustomAntennaCSV, type ParsedNode, type ParsedEdge, type NodeType } from '@/utils/csvParser';
import ExpressionField from '@/components/ExpressionField';
import { WirePreview3D } from '@/components/WirePreview3D';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodeRow {
  id: number;
  x: string;
  y: string;
  z: string;
  nodeType: NodeType;
}

interface EdgeRow {
  node_start: number;
  node_end: number;
  radius: string; // empty = use node avg
}

export interface CustomAntennaDialogProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (data: CustomFormData) => Promise<void>;
  /** When provided, dialog opens in edit mode pre-populated with this data */
  initialData?: {
    elementId: string;
    name: string;
    nodes: Array<{ id: number; x: number; y: number; z: number }>;
    edges: Array<{ node_start: number; node_end: number; radius?: number }>;
    sourceNodeIds?: number[];
  };
}

export interface CustomFormData {
  name: string;
  nodes: Array<{ id: number; x: number; y: number; z: number; radius?: number }>;
  edges: Array<{ node_start: number; node_end: number; radius?: number }>;
  sources?: Array<{
    type: 'voltage' | 'current';
    amplitude: { real: number; imag: number };
    node_start: number;
    node_end: number;
  }>;
  variable_context?: Array<{ name: string; expression: string; unit?: string; description?: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextNodeId = 1;

function createDefaultNodes(): NodeRow[] {
  nextNodeId = 3;
  return [
    { id: 1, x: '0', y: '0', z: '0', nodeType: 'terminal' },
    { id: 2, x: '0', y: '0', z: '0.5', nodeType: 'regular' },
  ];
}

function createDefaultEdges(): EdgeRow[] {
  return [{ node_start: 1, node_end: 2, radius: '0.001' }];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CustomAntennaDialog: React.FC<CustomAntennaDialogProps> = ({
  open,
  onClose,
  onGenerate,
  initialData,
}) => {
  const isEditMode = !!initialData;
  const [activeTab, setActiveTab] = useState(0);
  const [name, setName] = useState('Custom Antenna');
  const [isGenerating, setIsGenerating] = useState(false);

  // Manual editor state
  const [nodes, setNodes] = useState<NodeRow[]>(createDefaultNodes);
  const [edges, setEdges] = useState<EdgeRow[]>(createDefaultEdges);

  // CSV import state
  const [csvText, setCsvText] = useState('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);
  const [csvParsedNodes, setCsvParsedNodes] = useState<ParsedNode[]>([]);
  const [csvParsedEdges, setCsvParsedEdges] = useState<ParsedEdge[]>([]);

  // Generation error
  const [genError, setGenError] = useState<string | null>(null);

  const variableContext = useAppSelector(selectVariableContextNumeric);

  // Populate from initialData when editing
  useEffect(() => {
    if (!open || !initialData) return;
    const srcIds = new Set(initialData.sourceNodeIds ?? []);
    setName(initialData.name);
    const editNodes: NodeRow[] = initialData.nodes.map((n) => {
      const nodeType: NodeType = srcIds.has(n.id) ? 'terminal' : 'regular';
      return { id: n.id, x: String(n.x), y: String(n.y), z: String(n.z), nodeType };
    });
    setNodes(editNodes);
    nextNodeId = Math.max(...initialData.nodes.map((n) => n.id), 0) + 1;
    setEdges(initialData.edges.map((e) => ({
      node_start: e.node_start,
      node_end: e.node_end,
      radius: e.radius != null ? String(e.radius) : '0.001',
    })));
    setActiveTab(1); // Start on manual editor for edit mode
  }, [open, initialData]);

  const resolveCtx = useMemo(
    () => ({ ...BUILTIN_CONSTANTS, ...variableContext }),
    [variableContext],
  );

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------
  const resetForm = useCallback(() => {
    setName('Custom Antenna');
    setNodes(createDefaultNodes());
    setEdges(createDefaultEdges());
    setCsvText('');
    setCsvErrors([]);
    setCsvWarnings([]);
    setCsvParsedNodes([]);
    setCsvParsedEdges([]);
    setGenError(null);
    setActiveTab(0);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // -----------------------------------------------------------------------
  // Manual editor — node operations
  // -----------------------------------------------------------------------
  const addNode = () => {
    const newId = nextNodeId++;
    setNodes((prev) => [...prev, { id: newId, x: '0', y: '0', z: '0', nodeType: 'regular' as NodeType }]);
  };

  const removeNode = (id: number) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.node_start !== id && e.node_end !== id));
  };

  const updateNode = (id: number, field: keyof NodeRow, value: string | NodeType) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, [field]: value } : n)),
    );
  };

  // -----------------------------------------------------------------------
  // Manual editor — edge operations
  // -----------------------------------------------------------------------
  const addEdge = () => {
    const ids = nodes.map((n) => n.id);
    const start = ids[0] ?? 1;
    const end = ids.length > 1 ? ids[ids.length - 1] : start;
    setEdges((prev) => [...prev, { node_start: start, node_end: end, radius: '0.001' }]);
  };

  const removeEdge = (idx: number) => {
    setEdges((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEdge = (idx: number, field: keyof EdgeRow, value: string | number) => {
    setEdges((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)),
    );
  };

  // -----------------------------------------------------------------------
  // CSV import
  // -----------------------------------------------------------------------
  const handleCsvParse = useCallback(() => {
    const result = parseCustomAntennaCSV(csvText);
    setCsvErrors(result.errors);
    setCsvWarnings(result.warnings);
    setCsvParsedNodes(result.nodes);
    setCsvParsedEdges(result.edges);
  }, [csvText]);

  const handleCsvApply = () => {
    nextNodeId = Math.max(...csvParsedNodes.map((n) => n.id), 0) + 1;
    setNodes(
      csvParsedNodes.map((n) => ({
        id: n.id,
        x: String(n.x),
        y: String(n.y),
        z: String(n.z),
        nodeType: n.nodeType ?? 'regular' as NodeType,
      })),
    );
    setEdges(
      csvParsedEdges.map((e) => ({
        node_start: e.node_start,
        node_end: e.node_end,
        radius: e.radius != null ? String(e.radius) : '0.001',
      })),
    );
    setActiveTab(1); // Switch to manual editor
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setCsvText(e.target?.result as string);
    };
    reader.readAsText(file);
    event.target.value = ''; // reset input
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setCsvText(text);
    } catch {
      // Clipboard API might not be available
    }
  };

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required');
    if (nodes.length < 2) errs.push('At least 2 nodes are required');
    if (edges.length < 1) errs.push('At least 1 edge is required');

    // Check for duplicate node IDs
    const ids = new Set<number>();
    for (const n of nodes) {
      if (ids.has(n.id)) errs.push(`Duplicate node ID: ${n.id}`);
      ids.add(n.id);
    }

    // Check edges reference valid nodes
    for (const e of edges) {
      if (!ids.has(e.node_start)) errs.push(`Edge references missing node ${e.node_start}`);
      if (!ids.has(e.node_end)) errs.push(`Edge references missing node ${e.node_end}`);
      if (e.node_start === e.node_end) errs.push(`Self-loop on node ${e.node_start}`);
    }

    // Try resolving expressions
    for (const n of nodes) {
      for (const coord of ['x', 'y', 'z'] as const) {
        try {
          const val = parseNumericOrExpression(n[coord], resolveCtx);
          if (!Number.isFinite(val)) errs.push(`Node ${n.id} ${coord}: non-finite value`);
        } catch {
          errs.push(`Node ${n.id} ${coord}: invalid expression "${n[coord]}"`);
        }
      }
    }

    // Validate edge radii
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (e.radius) {
        try {
          const val = parseNumericOrExpression(e.radius, resolveCtx);
          if (!Number.isFinite(val) || val <= 0) errs.push(`Edge ${i + 1} radius must be positive`);
        } catch {
          errs.push(`Edge ${i + 1} radius: invalid expression "${e.radius}"`);
        }
      }
    }

    return errs;
  }, [name, nodes, edges, resolveCtx]);

  // -----------------------------------------------------------------------
  // Resolved nodes for 3D preview (best-effort: skip unresolvable)
  // -----------------------------------------------------------------------
  const previewNodes = useMemo(() => {
    return nodes
      .map((n) => {
        try {
          return {
            id: n.id,
            x: parseNumericOrExpression(n.x, resolveCtx),
            y: parseNumericOrExpression(n.y, resolveCtx),
            z: parseNumericOrExpression(n.z, resolveCtx),
            nodeType: n.nodeType,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ id: number; x: number; y: number; z: number; nodeType: NodeType }>;
  }, [nodes, resolveCtx]);

  const previewEdges = useMemo(() => {
    const validIds = new Set(previewNodes.map((n) => n.id));
    return edges
      .filter((e) => validIds.has(e.node_start) && validIds.has(e.node_end))
      .map((e) => ({
        node_start: e.node_start,
        node_end: e.node_end,
        ...(e.radius
          ? { radius: parseNumericOrExpression(e.radius, resolveCtx) }
          : { radius: 0.001 }),
      }));
  }, [edges, previewNodes, resolveCtx]);

  // Node type sets for preview
  const terminalNodeIds = useMemo(() => {
    return new Set(nodes.filter((n) => n.nodeType === 'terminal').map((n) => n.id));
  }, [nodes]);

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------
  const handleSubmit = async () => {
    if (validationErrors.length > 0) return;

    setIsGenerating(true);
    setGenError(null);

    try {
      const resolvedNodes = nodes.map((n) => ({
        id: n.id,
        x: parseNumericOrExpression(n.x, resolveCtx),
        y: parseNumericOrExpression(n.y, resolveCtx),
        z: parseNumericOrExpression(n.z, resolveCtx),
      }));

      const resolvedEdges = edges.map((e) => ({
        node_start: e.node_start,
        node_end: e.node_end,
        ...(e.radius ? { radius: parseNumericOrExpression(e.radius, resolveCtx) } : { radius: 0.001 }),
      }));

      await onGenerate({
        name,
        nodes: resolvedNodes,
        edges: resolvedEdges,
      });

      handleClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setGenError(message || 'Failed to generate custom antenna');
    } finally {
      setIsGenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit Custom Wire Antenna' : 'Custom Wire Antenna'}</DialogTitle>
      <DialogContent>
        <TextField
          label="Antenna Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          size="small"
          sx={{ mt: 1, mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 3, minHeight: 450 }}>
          {/* Left side: CSV/Editor tabs */}
          <Box sx={{ flex: '1 1 55%', minWidth: 0 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
          <Tab label="Import CSV" />
          <Tab label="Manual Editor" />
        </Tabs>

        {/* ── Tab 0: CSV Import ── */}
        {activeTab === 0 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<UploadFileIcon />}
              >
                Upload File
                <input type="file" hidden accept=".csv,.txt" onChange={handleFileUpload} />
              </Button>
              <Tooltip title="Paste from clipboard">
                <IconButton size="small" onClick={handlePaste}>
                  <PasteIcon />
                </IconButton>
              </Tooltip>
            </Box>

            <TextField
              multiline
              rows={10}
              fullWidth
              placeholder={`# Custom antenna CSV\n# NODES: N, id, x, y, z [, P]\n# EDGES: E, start, end [, radius]\nN, 1, 0, 0, 0, P\nN, 2, 0, 0, 0.5\nE, 1, 2, 0.001`}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              sx={{ fontFamily: 'monospace', fontSize: '0.85rem', mb: 1 }}
            />

            <Button
              variant="contained"
              size="small"
              onClick={handleCsvParse}
              disabled={!csvText.trim()}
              sx={{ mb: 1 }}
            >
              Parse
            </Button>

            {csvErrors.length > 0 && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {csvErrors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </Alert>
            )}

            {csvWarnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                {csvWarnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </Alert>
            )}

            {csvParsedNodes.length > 0 && csvErrors.length === 0 && (
              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Parsed: {csvParsedNodes.length} nodes, {csvParsedEdges.length} edges
                </Typography>
                <Button variant="outlined" size="small" onClick={handleCsvApply}>
                  Apply to Editor
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* ── Tab 1: Manual Editor ── */}
        {activeTab === 1 && (
          <Box>
            {/* Node table */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                Nodes ({nodes.length})
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addNode}>
                Add Node
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 250 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 60 }}>ID</TableCell>
                    <TableCell>X (m)</TableCell>
                    <TableCell>Y (m)</TableCell>
                    <TableCell>Z (m)</TableCell>
                    <TableCell sx={{ width: 110 }}>Type</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>
                        <Chip label={node.id} size="small" />
                      </TableCell>
                      {(['x', 'y', 'z'] as const).map((coord) => (
                        <TableCell key={coord} sx={{ p: 0.5 }}>
                          <ExpressionField
                            value={node[coord]}
                            onChange={(val) => updateNode(node.id, coord, val)}
                            size="small"
                            sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
                          />
                        </TableCell>
                      ))}
                      <TableCell sx={{ p: 0.5 }}>
                        <Select
                          size="small"
                          value={node.nodeType}
                          onChange={(e) => updateNode(node.id, 'nodeType', e.target.value as NodeType)}
                          sx={{ fontSize: '0.8rem', '& .MuiSelect-select': { py: 0.5 } }}
                          fullWidth
                        >
                          <MenuItem value="regular">Regular</MenuItem>
                          <MenuItem value="terminal">Terminal</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell sx={{ p: 0 }}>
                        <IconButton
                          size="small"
                          onClick={() => removeNode(node.id)}
                          disabled={nodes.length <= 2}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Edge table */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                Edges ({edges.length})
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addEdge}>
                Add Edge
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }}>#</TableCell>
                    <TableCell>Start Node</TableCell>
                    <TableCell>End Node</TableCell>
                    <TableCell>Radius (m)</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {edges.map((edge, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <TextField
                          type="number"
                          size="small"
                          value={edge.node_start}
                          onChange={(e) => updateEdge(idx, 'node_start', Number(e.target.value))}
                          inputProps={{ min: 1 }}
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <TextField
                          type="number"
                          size="small"
                          value={edge.node_end}
                          onChange={(e) => updateEdge(idx, 'node_end', Number(e.target.value))}
                          inputProps={{ min: 1 }}
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <ExpressionField
                          value={edge.radius}
                          onChange={(val) => updateEdge(idx, 'radius', val)}
                          size="small"
                          placeholder="auto"
                          validate={(v) => (v > 0 ? null : 'Must be > 0')}
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0 }}>
                        <IconButton
                          size="small"
                          onClick={() => removeEdge(idx)}
                          disabled={edges.length <= 1}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
          </Box>

          {/* Right side: always-visible 3D preview */}
          <Box sx={{ flex: '1 1 45%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>
              3D Preview
            </Typography>
            {previewNodes.length >= 2 && previewEdges.length >= 1 ? (
              <WirePreview3D
                nodes={previewNodes}
                edges={previewEdges}
                sourceNodes={terminalNodeIds}
                showLabels
                showEdgeLabels
                height="100%"
                width="100%"
                onNodeSelect={(id) => console.log('Node selected:', id)}
              />
            ) : (
              <Box sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#1a1a2e',
                borderRadius: 1,
                color: '#666',
                minHeight: 300,
              }}>
                Add at least 2 valid nodes and 1 edge to see preview
              </Box>
            )}
            <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" sx={{ bgcolor: '#6699cc', color: '#fff' }} label="Regular node" />
              <Chip size="small" sx={{ bgcolor: '#ff4444', color: '#fff' }} label="Terminal node" />
            </Box>
          </Box>
        </Box>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Validation Errors</Typography>
            {validationErrors.map((e, i) => (
              <div key={i}>• {e}</div>
            ))}
          </Alert>
        )}

        {/* Generation error */}
        {genError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {genError}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isGenerating || validationErrors.length > 0}
        >
          {isGenerating ? 'Generating…' : isEditMode ? 'Update' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
