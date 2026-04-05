/**
 * ParameterStudyDialog — configures a 1D or 2D parameter sweep.
 *
 * The user selects up to 2 variables from the variable system,
 * configures min/max/points/spacing for each, and sets the reference
 * impedance.  The dialog emits a ParameterStudyConfig on submit.
 */
import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormLabel,
  IconButton,
  Chip,
  Divider,
  Alert,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useAppSelector } from '@/store/hooks';
import { selectVariables, selectVariableContextNumeric } from '@/store/variablesSlice';
import type {
  ParameterStudyConfig,
  SweepVariable,
  SweepSpacing,
} from '@/types/parameterStudy';
import { buildSweepGrid } from '@/types/parameterStudy';

// ============================================================================
// Props
// ============================================================================

export interface ParameterStudyDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (config: ParameterStudyConfig) => void;
  isLoading?: boolean;
  /** Pre-populate from a previous parameter study config (e.g. last sweep). */
  initialConfig?: ParameterStudyConfig | null;
}

// ============================================================================
// Internal state per sweep variable
// ============================================================================

interface SweepVarState {
  variableName: string;
  min: string;
  max: string;
  numPoints: number;
  spacing: SweepSpacing;
}

const DEFAULT_VAR_STATE: SweepVarState = {
  variableName: '',
  min: '',
  max: '',
  numPoints: 11,
  spacing: 'linear',
};

// ============================================================================
// Component
// ============================================================================

export const ParameterStudyDialog: React.FC<ParameterStudyDialogProps> = ({
  open,
  onClose,
  onSubmit,
  isLoading = false,
  initialConfig,
}) => {
  const variables = useAppSelector(selectVariables);
  const numericContext = useAppSelector(selectVariableContextNumeric);

  // Derive initial sweep-var state from initialConfig (or fresh default)
  const buildInitialState = (): SweepVarState[] => {
    if (initialConfig && initialConfig.sweepVariables.length > 0) {
      return initialConfig.sweepVariables.map((sv) => ({
        variableName: sv.variableName,
        min: String(sv.min),
        max: String(sv.max),
        numPoints: sv.numPoints,
        spacing: sv.spacing,
      }));
    }
    return [{ ...DEFAULT_VAR_STATE, variableName: 'freq' }];
  };

  // Per-variable sweep configuration (1 or 2)
  const [sweepVars, setSweepVars] = useState<SweepVarState[]>(buildInitialState);

  // Re-initialize when the dialog opens with a (possibly new) initialConfig
  React.useEffect(() => {
    if (open) {
      setSweepVars(buildInitialState());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ========================================================================
  // Handlers
  // ========================================================================

  const updateSweepVar = (index: number, patch: Partial<SweepVarState>) => {
    setSweepVars((prev) =>
      prev.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    );
  };

  const addSecondVariable = () => {
    if (sweepVars.length < 2) {
      const available = variables.filter(
        (v) => v.name !== sweepVars[0]?.variableName,
      );
      setSweepVars((prev) => [
        ...prev,
        { ...DEFAULT_VAR_STATE, variableName: available[0]?.name || '' },
      ]);
    }
  };

  const removeSecondVariable = () => {
    setSweepVars((prev) => prev.slice(0, 1));
  };

  // Parse numeric value, returning the current evaluated value as fallback
  const parseVal = (s: string, fallback: number): number => {
    const n = parseFloat(s);
    return isNaN(n) ? fallback : n;
  };

  // Build config
  const config: ParameterStudyConfig | null = useMemo(() => {
    const svs: SweepVariable[] = sweepVars
      .filter((v) => v.variableName !== '')
      .map((v) => {
        const currentVal = numericContext[v.variableName] ?? 0;
        return {
          variableName: v.variableName,
          min: parseVal(v.min, currentVal * 0.5),
          max: parseVal(v.max, currentVal * 1.5),
          numPoints: Math.max(2, v.numPoints),
          spacing: v.spacing,
        };
      });
    if (svs.length === 0) return null;
    // Validate min < max
    for (const sv of svs) {
      if (sv.min >= sv.max) return null;
    }
    return { sweepVariables: svs };
  }, [sweepVars, numericContext]);

  const totalPoints = config ? buildSweepGrid(config).length : 0;

  const handleSubmit = () => {
    if (config) onSubmit(config);
  };

  // ========================================================================
  // Render
  // ========================================================================

  const renderSweepVarRow = (sv: SweepVarState, index: number) => {
    const currentVal = numericContext[sv.variableName];
    const varDef = variables.find((v) => v.name === sv.variableName);
    const unit = varDef?.unit || '';

    // Determine available options (exclude the other sweep variable)
    const otherNames = sweepVars
      .filter((_, i) => i !== index)
      .map((v) => v.variableName);
    const availableVars = variables.filter(
      (v) => !otherNames.includes(v.name),
    );

    return (
      <Box key={index} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
            <InputLabel id={`sweep-var-${index}-label`}>Variable {index + 1}</InputLabel>
            <Select
              labelId={`sweep-var-${index}-label`}
              label={`Variable ${index + 1}`}
              value={sv.variableName}
              onChange={(e) =>
                updateSweepVar(index, { variableName: e.target.value })
              }
            >
              {availableVars.map((v) => (
                <MenuItem key={v.name} value={v.name}>
                  {v.name} {v.unit ? `(${v.unit})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {currentVal !== undefined && (
            <Chip
              size="small"
              label={`= ${currentVal.toPrecision(4)}`}
              sx={{ fontFamily: 'monospace' }}
            />
          )}
          {index === 1 && (
            <IconButton
              size="small"
              color="error"
              onClick={removeSecondVariable}
              title="Remove variable"
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            label={`Min${unit ? ` (${unit})` : ''}`}
            size="small"
            type="number"
            value={sv.min}
            onChange={(e) => updateSweepVar(index, { min: e.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            label={`Max${unit ? ` (${unit})` : ''}`}
            size="small"
            type="number"
            value={sv.max}
            onChange={(e) => updateSweepVar(index, { max: e.target.value })}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Points"
            size="small"
            type="number"
            value={sv.numPoints}
            onChange={(e) =>
              updateSweepVar(index, {
                numPoints: parseInt(e.target.value) || 2,
              })
            }
            inputProps={{ min: 2, max: 200 }}
            sx={{ width: 80 }}
          />
        </Box>

        <FormControl component="fieldset" size="small">
          <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>
            Spacing
          </FormLabel>
          <RadioGroup
            row
            value={sv.spacing}
            onChange={(e) =>
              updateSweepVar(index, {
                spacing: e.target.value as SweepSpacing,
              })
            }
          >
            <FormControlLabel
              value="linear"
              control={<Radio size="small" />}
              label="Linear"
            />
            <FormControlLabel
              value="logarithmic"
              control={<Radio size="small" />}
              label="Logarithmic"
            />
          </RadioGroup>
        </FormControl>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isLoading}
    >
      <DialogTitle>Parameter Study</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Sweep Variables */}
          {sweepVars.map((sv, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Divider />}
              {renderSweepVarRow(sv, i)}
            </React.Fragment>
          ))}

          {/* Add Second Variable */}
          {sweepVars.length < 2 && (
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={addSecondVariable}
              size="small"
              sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
            >
              Add second variable
            </Button>
          )}

          <Divider />

          {/* Grid Summary */}
          <Alert severity="info" sx={{ py: 0.5 }}>
            <Typography variant="body2">
              {totalPoints > 0
                ? `${totalPoints} simulation point${totalPoints !== 1 ? 's' : ''} in the sweep grid`
                : 'Configure variables to see grid size'}
            </Typography>
          </Alert>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || !config || totalPoints === 0}
        >
          {isLoading ? 'Running...' : `Run (${totalPoints} points)`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
