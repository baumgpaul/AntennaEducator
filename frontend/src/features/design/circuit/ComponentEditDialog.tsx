/**
 * Dialog for adding or editing a circuit component.
 *
 * Allows selecting component type (R, L, C, V, I), value,
 * phase (for sources), connection nodes, and optional label.
 * Supports variable expressions in value/phase fields.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Typography,
  Chip,
  Box,
} from '@mui/material';
import ExpressionField from '@/components/ExpressionField';
import { useAppSelector } from '@/store/hooks';
import { selectVariables } from '@/store/variablesSlice';
import { BUILTIN_CONSTANTS, evaluateVariableContextNumeric, evaluateExpression } from '@/utils/expressionEvaluator';
import type {
  CircuitComponentType,
  CircuitComponent,
  CircuitNode,
} from '@/types/circuitTypes';
import { COMPONENT_DEFAULTS, COMPONENT_TYPE_LABELS } from '@/types/circuitTypes';

// ============================================================================
// Props
// ============================================================================

interface ComponentEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (component: Omit<CircuitComponent, 'id'> & { id?: string }) => void;
  /** Available nodes for connection */
  nodes: CircuitNode[];
  /** Existing component to edit (null for new) */
  editComponent?: CircuitComponent | null;
}

// ============================================================================
// Component
// ============================================================================

export const ComponentEditDialog: React.FC<ComponentEditDialogProps> = ({
  open,
  onClose,
  onSave,
  nodes,
  editComponent,
}) => {
  const [type, setType] = useState<CircuitComponentType>('resistor');
  const [valueStr, setValueStr] = useState('50');
  const [phaseStr, setPhaseStr] = useState('0');
  const [nodeA, setNodeA] = useState<number>(0);
  const [nodeB, setNodeB] = useState<number>(1);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const variables = useAppSelector(selectVariables);
  const resolveCtx = useMemo(() => {
    const userVars = evaluateVariableContextNumeric(variables);
    return { ...BUILTIN_CONSTANTS, ...userVars };
  }, [variables]);

  // Reset when opening or when editComponent changes
  useEffect(() => {
    if (!open) return;

    if (editComponent) {
      setType(editComponent.type);
      setValueStr(editComponent.valueExpression || String(editComponent.value));
      setPhaseStr(editComponent.phaseExpression || String(editComponent.phase));
      setNodeA(editComponent.nodeA);
      setNodeB(editComponent.nodeB);
      setLabel(editComponent.label);
    } else {
      setType('resistor');
      setValueStr(String(COMPONENT_DEFAULTS.resistor.value));
      setPhaseStr('0');
      // Default nodes: first available pair
      if (nodes.length >= 2) {
        setNodeA(nodes[0].index);
        setNodeB(nodes[1].index);
      } else if (nodes.length === 1) {
        setNodeA(nodes[0].index);
        setNodeB(0);
      }
      setLabel('');
    }
    setError(null);
  }, [open, editComponent, nodes]);

  // Update default value when type changes (only for new components)
  useEffect(() => {
    if (!editComponent) {
      setValueStr(String(COMPONENT_DEFAULTS[type].value));
      if (type !== 'voltage_source' && type !== 'current_source') {
        setPhaseStr('0');
      }
    }
  }, [type, editComponent]);

  const handleSave = () => {
    setError(null);

    // Resolve value expression
    let resolvedValue: number;
    try {
      const numVal = Number(valueStr);
      if (!isNaN(numVal)) {
        resolvedValue = numVal;
      } else {
        // Try expression evaluation
        resolvedValue = evaluateExpression(valueStr, resolveCtx);
      }
    } catch {
      setError(`Invalid value expression: "${valueStr}"`);
      return;
    }

    // Resolve phase expression
    let resolvedPhase = 0;
    if (type === 'voltage_source' || type === 'current_source') {
      try {
        const numPhase = Number(phaseStr);
        if (!isNaN(numPhase)) {
          resolvedPhase = numPhase;
        } else {
          resolvedPhase = evaluateExpression(phaseStr, resolveCtx);
        }
      } catch {
        setError(`Invalid phase expression: "${phaseStr}"`);
        return;
      }
    }

    // Validation
    if (resolvedValue <= 0 && type !== 'voltage_source' && type !== 'current_source') {
      setError('Value must be positive for passive components');
      return;
    }
    if (resolvedValue === 0 && (type === 'voltage_source' || type === 'current_source')) {
      setError('Source amplitude cannot be zero');
      return;
    }
    if (nodeA === nodeB) {
      setError('Node A and Node B must be different');
      return;
    }

    onSave({
      id: editComponent?.id,
      type,
      nodeA,
      nodeB,
      value: Math.abs(resolvedValue),
      phase: resolvedPhase,
      label,
      valueExpression: valueStr !== String(Math.abs(resolvedValue)) ? valueStr : undefined,
      phaseExpression: phaseStr !== String(resolvedPhase) ? phaseStr : undefined,
    });

    onClose();
  };

  const isSource = type === 'voltage_source' || type === 'current_source';
  const defaults = COMPONENT_DEFAULTS[type];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {editComponent ? 'Edit Component' : 'Add Component'}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          {/* Component Type */}
          <Grid item xs={12}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                value={type}
                label="Type"
                onChange={(e) => setType(e.target.value as CircuitComponentType)}
              >
                {(Object.keys(COMPONENT_TYPE_LABELS) as CircuitComponentType[]).map((t) => (
                  <MenuItem key={t} value={t}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        size="small"
                        label={COMPONENT_DEFAULTS[t].symbol}
                        sx={{
                          bgcolor: t === 'resistor' ? '#ff980040'
                            : t === 'inductor' ? '#2196f340'
                            : t === 'capacitor' ? '#4caf5040'
                            : t === 'voltage_source' ? '#f4433640'
                            : '#e91e6340',
                          color: '#fff',
                          fontWeight: 700,
                          minWidth: 28,
                        }}
                      />
                      {COMPONENT_TYPE_LABELS[t]}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Value */}
          <Grid item xs={isSource ? 6 : 12}>
            <ExpressionField
              label={`Value (${defaults.unit})`}
              value={valueStr}
              onChange={setValueStr}
              size="small"
            />
          </Grid>

          {/* Phase (sources only) */}
          {isSource && (
            <Grid item xs={6}>
              <ExpressionField
                label="Phase (°)"
                value={phaseStr}
                onChange={setPhaseStr}
                size="small"
              />
            </Grid>
          )}

          {/* Node A */}
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Node A</InputLabel>
              <Select
                value={nodeA}
                label="Node A"
                onChange={(e) => setNodeA(Number(e.target.value))}
              >
                {nodes.map((n) => (
                  <MenuItem key={n.index} value={n.index}>
                    <Typography variant="body2">
                      {n.label}
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                        ({n.index})
                      </Typography>
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Node B */}
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Node B</InputLabel>
              <Select
                value={nodeB}
                label="Node B"
                onChange={(e) => setNodeB(Number(e.target.value))}
              >
                {nodes.map((n) => (
                  <MenuItem key={n.index} value={n.index}>
                    <Typography variant="body2">
                      {n.label}
                      <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                        ({n.index})
                      </Typography>
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Label */}
          <Grid item xs={12}>
            <TextField
              label="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g., Load, Matching cap"
            />
          </Grid>

          {/* Error */}
          {error && (
            <Grid item xs={12}>
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          {editComponent ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ComponentEditDialog;
