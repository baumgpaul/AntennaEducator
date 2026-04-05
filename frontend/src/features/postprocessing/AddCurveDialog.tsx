/**
 * AddCurveDialog — wizard-style dialog for adding traces to a line plot.
 *
 * Steps:
 *   1. Source: Port / Field / Farfield / Distribution
 *   2. Quantity: e.g. Re(Z), |Z|, VSWR, Return Loss, ...
 *   3. Mode: Single Curve  or  Curve Group (overlay all values of 2nd variable)
 *   4. (Curve Group) Select which variable is the overlay variable + fixed-value index
 */
import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Chip,
  Slider,
  FormControlLabel,
  Switch,
  Divider,
} from '@mui/material';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import SensorsIcon from '@mui/icons-material/Sensors';
import RadarIcon from '@mui/icons-material/Radar';
import TimelineIcon from '@mui/icons-material/Timeline';
import type { PlotTrace, PlotQuantity, LineStyle } from '@/types/plotDefinitions';
import { TRACE_COLORS } from '@/types/plotDefinitions';
import type { ParameterStudyResult } from '@/types/parameterStudy';

// ============================================================================
// Quantity catalog
// ============================================================================

interface QuantityOption {
  quantity: PlotQuantity;
  label: string;
  description: string;
  defaultYAxis: 'left' | 'right';
}

const PORT_QUANTITIES: QuantityOption[] = [
  { quantity: { source: 'port', quantity: 'impedance_real' }, label: 'Re(Z)', description: 'Real part of input impedance (Ω)', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'impedance_imag' }, label: 'Im(Z)', description: 'Imaginary part of input impedance (Ω)', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'impedance_magnitude' }, label: '|Z|', description: 'Impedance magnitude (Ω)', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'impedance_phase' }, label: '∠Z', description: 'Impedance phase (°)', defaultYAxis: 'right' },
  { quantity: { source: 'port', quantity: 'return_loss' }, label: 'Return Loss', description: 'S₁₁ return loss (dB)', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'vswr' }, label: 'VSWR', description: 'Voltage standing wave ratio', defaultYAxis: 'right' },
  { quantity: { source: 'port', quantity: 'reflection_coefficient_magnitude' }, label: '|Γ|', description: 'Reflection coefficient magnitude', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'reflection_coefficient_phase' }, label: '∠Γ', description: 'Reflection coefficient phase (°)', defaultYAxis: 'right' },
  { quantity: { source: 'port', quantity: 'port_voltage_magnitude' }, label: '|V|', description: 'Port voltage magnitude (V)', defaultYAxis: 'left' },
  { quantity: { source: 'port', quantity: 'port_current_magnitude' }, label: '|I|', description: 'Port current magnitude (A)', defaultYAxis: 'left' },
];

const DISTRIBUTION_QUANTITIES: QuantityOption[] = [
  { quantity: { source: 'distribution', quantity: 'current_magnitude' }, label: '|I(z)|', description: 'Current magnitude along wire', defaultYAxis: 'left' },
  { quantity: { source: 'distribution', quantity: 'current_phase' }, label: '∠I(z)', description: 'Current phase along wire (°)', defaultYAxis: 'right' },
  { quantity: { source: 'distribution', quantity: 'voltage_magnitude' }, label: '|V(z)|', description: 'Voltage magnitude along wire', defaultYAxis: 'left' },
  { quantity: { source: 'distribution', quantity: 'voltage_phase' }, label: '∠V(z)', description: 'Voltage phase along wire (°)', defaultYAxis: 'right' },
];

const FARFIELD_QUANTITIES: QuantityOption[] = [
  { quantity: { source: 'farfield', quantity: 'directivity' }, label: 'Directivity', description: 'Directivity (dBi)', defaultYAxis: 'left' },
  { quantity: { source: 'farfield', quantity: 'gain' }, label: 'Gain', description: 'Gain (dBi)', defaultYAxis: 'left' },
  { quantity: { source: 'farfield', quantity: 'E_theta' }, label: 'E_θ', description: 'Theta component of E-field', defaultYAxis: 'left' },
  { quantity: { source: 'farfield', quantity: 'E_phi' }, label: 'E_φ', description: 'Phi component of E-field', defaultYAxis: 'left' },
];

type SourceType = 'port' | 'field' | 'farfield' | 'distribution';

const SOURCE_OPTIONS: { type: SourceType; label: string; description: string; icon: React.ReactNode }[] = [
  { type: 'port', label: 'Port Quantities', description: 'Impedance, VSWR, return loss, reflection', icon: <ElectricalServicesIcon /> },
  { type: 'distribution', label: 'Current/Voltage Distribution', description: 'Along wire: |I|, |V|, phase', icon: <TimelineIcon /> },
  { type: 'farfield', label: 'Far-Field', description: 'Directivity, gain, Eθ, Eφ', icon: <RadarIcon /> },
  { type: 'field', label: 'Near-Field', description: 'E/H magnitudes at observation points', icon: <SensorsIcon /> },
];

function getQuantitiesForSource(source: SourceType): QuantityOption[] {
  switch (source) {
    case 'port': return PORT_QUANTITIES;
    case 'distribution': return DISTRIBUTION_QUANTITIES;
    case 'farfield': return FARFIELD_QUANTITIES;
    case 'field': return []; // Placeholder until field extractors are wired
  }
}

// ============================================================================
// Types
// ============================================================================

export type AddCurveMode = 'single' | 'group';

export interface AddCurveResult {
  mode: AddCurveMode;
  traces: PlotTrace[];
}

interface AddCurveDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: AddCurveResult) => void;
  parameterStudy: ParameterStudyResult | null;
  existingTraceCount: number;
  /** Whether port/impedance data is available (frequencySweep or parameterStudy) */
  hasPortData?: boolean;
  /** Whether current/voltage distribution data is available */
  hasDistributionData?: boolean;
  /** Whether far-field/radiation pattern data is available */
  hasFarfieldData?: boolean;
}

// ============================================================================
// Component
// ============================================================================

const STEPS_SINGLE = ['Source', 'Quantity'];
const STEPS_GROUP = ['Source', 'Quantity', 'Overlay Variable'];

export default function AddCurveDialog({
  open,
  onClose,
  onAdd,
  parameterStudy,
  existingTraceCount,
  hasPortData = false,
  hasDistributionData = false,
  hasFarfieldData = false,
}: AddCurveDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState<QuantityOption | null>(null);
  const [mode, setMode] = useState<AddCurveMode>('single');
  const [overlayVarIdx, setOverlayVarIdx] = useState(0);
  const [fixedValueIdx, setFixedValueIdx] = useState(0);

  const sweepVars = parameterStudy?.config.sweepVariables ?? [];
  const hasTwoVars = sweepVars.length >= 2;
  const steps = mode === 'group' ? STEPS_GROUP : STEPS_SINGLE;

  const isSourceAvailable = (type: SourceType): boolean => {
    switch (type) {
      case 'port': return hasPortData;
      case 'distribution': return hasDistributionData;
      case 'farfield': return hasFarfieldData;
      case 'field': return false; // Not yet wired
    }
  };

  // Sweep values for variable sliders
  const overlayVar = hasTwoVars ? sweepVars[overlayVarIdx] : sweepVars[0];
  const fixedVar = hasTwoVars ? sweepVars[1 - overlayVarIdx] : null;
  const fixedValues = useMemo(() => {
    if (!fixedVar) return [];
    const { min, max, numPoints } = fixedVar;
    return Array.from({ length: numPoints }, (_, i) =>
      numPoints <= 1 ? min : min + (i / (numPoints - 1)) * (max - min),
    );
  }, [fixedVar]);

  const overlayValues = useMemo(() => {
    if (!overlayVar) return [];
    const { min, max, numPoints } = overlayVar;
    return Array.from({ length: numPoints }, (_, i) =>
      numPoints <= 1 ? min : min + (i / (numPoints - 1)) * (max - min),
    );
  }, [overlayVar]);

  const handleReset = () => {
    setActiveStep(0);
    setSelectedSource(null);
    setSelectedQuantity(null);
    setMode('single');
    setOverlayVarIdx(0);
    setFixedValueIdx(0);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSourceSelect = (source: SourceType) => {
    setSelectedSource(source);
    setActiveStep(1);
  };

  const handleQuantitySelect = (option: QuantityOption) => {
    setSelectedQuantity(option);
    if (mode === 'group' && hasTwoVars) {
      setActiveStep(2);
    } else {
      // Immediately create trace(s) for single mode
      handleFinish(option, 'single');
    }
  };

  const handleFinish = (qOpt?: QuantityOption, overrideMode?: AddCurveMode) => {
    const q = qOpt || selectedQuantity;
    const m = overrideMode || mode;
    if (!q) return;

    if (m === 'single') {
      const colorIdx = existingTraceCount % TRACE_COLORS.length;
      const trace: PlotTrace = {
        id: `trace_${Date.now()}`,
        quantity: q.quantity,
        label: q.label,
        color: TRACE_COLORS[colorIdx],
        lineStyle: 'solid',
        yAxisId: q.defaultYAxis,
      };
      onAdd({ mode: 'single', traces: [trace] });
    } else {
      // Curve group: one trace per overlay value
      const traces: PlotTrace[] = overlayValues.map((val, i) => {
        const colorIdx = (existingTraceCount + i) % TRACE_COLORS.length;
        const lineStyles: LineStyle[] = ['solid', 'dashed', 'dotted'];
        const lineStyle = lineStyles[Math.floor(i / TRACE_COLORS.length) % lineStyles.length];
        const varLabel = overlayVar?.variableName ?? '?';
        const valStr = formatValue(val);
        return {
          id: `trace_${Date.now()}_${i}`,
          quantity: q.quantity,
          label: `${q.label} (${varLabel}=${valStr})`,
          color: TRACE_COLORS[colorIdx],
          lineStyle,
          yAxisId: q.defaultYAxis,
        };
      });
      onAdd({ mode: 'group', traces });
    }
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add {mode === 'group' ? 'Curve Group' : 'Curve'}
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 2, pt: 1 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Mode toggle — only show when 2-var sweep */}
        {activeStep === 0 && hasTwoVars && (
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={mode === 'group'}
                  onChange={(_, checked) => setMode(checked ? 'group' : 'single')}
                  size="small"
                />
              }
              label={
                <Typography variant="body2">
                  {mode === 'group'
                    ? 'Curve Group — overlay all values of a sweep variable'
                    : 'Single Curve — one trace from the full sweep'}
                </Typography>
              }
            />
          </Box>
        )}

        {/* Step 1: Source */}
        {activeStep === 0 && (
          <List>
            {SOURCE_OPTIONS.map((opt) => {
              const available = isSourceAvailable(opt.type);
              return (
                <ListItemButton
                  key={opt.type}
                  onClick={() => handleSourceSelect(opt.type)}
                  selected={selectedSource === opt.type}
                  disabled={!available}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemIcon>{opt.icon}</ListItemIcon>
                  <ListItemText
                    primary={opt.label}
                    secondary={opt.description}
                  />
                  {!available && (
                    <Chip label="No data" size="small" variant="outlined" />
                  )}
                </ListItemButton>
              );
            })}
          </List>
        )}

        {/* Step 2: Quantity */}
        {activeStep === 1 && selectedSource && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Choose a quantity to plot:
            </Typography>
            <List dense>
              {getQuantitiesForSource(selectedSource).map((opt) => (
                <ListItemButton
                  key={opt.quantity.quantity}
                  onClick={() => handleQuantitySelect(opt)}
                  sx={{ borderRadius: 1, mb: 0.25 }}
                >
                  <ListItemText
                    primary={opt.label}
                    secondary={opt.description}
                  />
                  <Chip
                    label={opt.defaultYAxis === 'left' ? 'Left axis' : 'Right axis'}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                </ListItemButton>
              ))}
            </List>
          </>
        )}

        {/* Step 3: Curve Group config (only for 2-var group mode) */}
        {activeStep === 2 && mode === 'group' && hasTwoVars && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              Overlay Variable
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Each value of the overlay variable becomes a separate curve.
              The other variable is held at a fixed value.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              {sweepVars.map((sv, idx) => (
                <Chip
                  key={sv.variableName}
                  label={`Overlay: ${sv.variableName}`}
                  color={overlayVarIdx === idx ? 'primary' : 'default'}
                  onClick={() => {
                    setOverlayVarIdx(idx);
                    setFixedValueIdx(0);
                  }}
                  variant={overlayVarIdx === idx ? 'filled' : 'outlined'}
                />
              ))}
            </Box>

            {fixedVar && fixedValues.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Fixed: {fixedVar.variableName} = {formatValue(fixedValues[fixedValueIdx])}
                </Typography>
                <Slider
                  value={fixedValueIdx}
                  min={0}
                  max={fixedValues.length - 1}
                  step={1}
                  marks={fixedValues.map((v, i) => ({ value: i, label: formatValue(v) }))}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => formatValue(fixedValues[v])}
                  onChange={(_, v) => setFixedValueIdx(v as number)}
                  sx={{ mx: 1 }}
                />
              </>
            )}

            <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Preview: {overlayValues.length} curves — {selectedQuantity?.label} vs. sweep,
                one per {overlayVar?.variableName} value
                {fixedVar ? ` at ${fixedVar.variableName}=${formatValue(fixedValues[fixedValueIdx])}` : ''}
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {activeStep > 0 && (
          <Button onClick={() => setActiveStep((s) => s - 1)}>Back</Button>
        )}
        <Button onClick={handleClose}>Cancel</Button>
        {activeStep === 2 && mode === 'group' && (
          <Button variant="contained" onClick={() => handleFinish()}>
            Add {overlayValues.length} Curves
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'G';
  if (abs >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
  if (abs >= 1) return v.toFixed(2).replace(/\.?0+$/, '');
  if (abs >= 1e-3) return (v * 1e3).toFixed(1).replace(/\.?0+$/, '') + 'm';
  return v.toExponential(2);
}
