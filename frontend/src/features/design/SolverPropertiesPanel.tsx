import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Slider,
  Paper,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  FormHelperText,
  FormGroup,
  RadioGroup,
  Radio,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '@/store/store';
import { updateFieldRegion, deleteFieldRegion, setDirectivitySettings, updateFieldResult } from '@/store/solverSlice';
import type { FieldDefinition, FieldDefinition1D, FieldDefinition2D, FieldDefinition3D, NormalPreset, SphereSampling, CuboidSampling } from '@/types/fieldDefinitions';
import { getEllipseAxesFromPreset } from '@/types/fieldDefinitions';

/**
 * SolverPropertiesPanel - Right-side panel for solver tab
 *
 * Shows:
 * - Field region visibility and opacity controls
 * - Selected field properties editor with full validation
 * - Empty state when nothing selected
 */

interface SolverPropertiesPanelProps {
  selectedFieldId?: string;
  fieldRegionsVisible: boolean;
  onFieldRegionsVisibleChange: (visible: boolean) => void;
}

export function SolverPropertiesPanel({
  selectedFieldId,
  fieldRegionsVisible,
  onFieldRegionsVisibleChange,
}: SolverPropertiesPanelProps) {
  const dispatch = useDispatch();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isDirectivitySelected = selectedFieldId === 'directivity';

  // Get selected field from Redux
  const selectedField = useSelector((state: RootState) =>
    state.solver.requestedFields.find(f => f.id === selectedFieldId)
  ) as FieldDefinition | undefined;

  // Get directivity settings
  const directivitySettings = useSelector((state: RootState) => state.solver.directivitySettings);

  // Update field property on blur (auto-save)
  const handleFieldUpdate = (updates: Partial<FieldDefinition>) => {
    if (selectedFieldId) {
      dispatch(updateFieldRegion({ id: selectedFieldId, updates }));
    }
  };

  // Handle delete with confirmation
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedFieldId) {
      dispatch(deleteFieldRegion(selectedFieldId));
      setDeleteDialogOpen(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Field Region Display Settings */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Show Requested Fields
        </Typography>

        <Divider sx={{ my: 1.5 }} />

        {/* Visibility toggle */}
        <FormControlLabel
          control={
            <Checkbox
              checked={fieldRegionsVisible}
              onChange={(e) => {
                console.log('[SolverPropertiesPanel] Checkbox clicked:', e.target.checked);
                onFieldRegionsVisibleChange(e.target.checked);
              }}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Show Field Regions
            </Typography>
          }
          sx={{ mb: 2 }}
        />
      </Paper>

      {/* Field Properties Editor */}
      {isDirectivitySelected ? (
        directivitySettings ? (
          <DirectivitySettingsEditor
            settings={directivitySettings}
            onUpdate={(newSettings) => {
              dispatch(setDirectivitySettings(newSettings));
              // Clear computed status to force recomputation
              dispatch(updateFieldResult({ fieldId: 'directivity', computed: false, num_points: 0 }));
            }}
          />
        ) : (
          <Paper variant="outlined" sx={{ p: 3, mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>Directivity</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Directivity will be computed in the far field when you click "Compute Postprocessing Result"
            </Typography>
          </Paper>
        )
      ) : selectedField ? (
        <FieldPropertiesEditor
          field={selectedField}
          onUpdate={handleFieldUpdate}
          onDelete={handleDeleteClick}
        />
      ) : (
        <Box sx={{ color: 'text.secondary', textAlign: 'center', mt: 4 }}>
          <Typography variant="body2">
            Select a field region in the tree view to edit its properties
          </Typography>
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Field Region?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this field region? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ============================================================================
// Field Properties Editor Component
// ============================================================================

interface FieldPropertiesEditorProps {
  field: FieldDefinition;
  onUpdate: (updates: Partial<FieldDefinition>) => void;
  onDelete: () => void;
}

function FieldPropertiesEditor({ field, onUpdate, onDelete }: FieldPropertiesEditorProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const fieldOpacity = field.opacity ?? 0.3;

  // Cast helpers for type-narrowed access
  const field1D = field.type === '1D' ? (field as FieldDefinition1D) : undefined;
  const field2D = field.type === '2D' ? (field as FieldDefinition2D) : undefined;
  const field3D = field.type === '3D' ? (field as FieldDefinition3D) : undefined;

  // Validation helpers
  const validateNumber = (value: string, min?: number, max?: number): number | null => {
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    if (min !== undefined && num < min) return null;
    if (max !== undefined && num > max) return null;
    return num;
  };

  const validateInteger = (value: string, min: number = 1): number | null => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < min) return null;
    return num;
  };

  const validateNonZeroVector = (x: number, y: number, z: number): boolean => {
    const length = Math.sqrt(x * x + y * y + z * z);
    return length > 0.001;
  };

  const handleNameChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setErrors({ ...errors, name: 'Name is required' });
      return;
    }
    onUpdate({ name: trimmed });
    setErrors({ ...errors, name: '' });
    clearLocalValue('name');
  };

  const handleOpacityChange = (_event: Event, value: number | number[]) => {
    const percent = Array.isArray(value) ? value[0] : (value as number);
    const clamped = Math.min(100, Math.max(0, percent));
    const normalized = clamped / 100;
    onUpdate({ opacity: normalized });
    setLocalValues({ ...localValues, opacity: String(clamped) });
  };

  const getOpacityPercent = () => {
    if (localValues.opacity !== undefined) {
      const parsed = parseFloat(localValues.opacity);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return fieldOpacity * 100;
  };

  const getLocalValue = (key: string, defaultValue: string | number): string => {
    if (localValues[key] !== undefined) return localValues[key];
    if (defaultValue === undefined || defaultValue === null) return '';
    return String(defaultValue);
  };

  const clearLocalValue = (key: string) => {
    const { [key]: _removed, ...rest } = localValues;
    setLocalValues(rest);
  };

  // ---- Center Point (for shapes that have centerPoint) ----
  const handleCenterChange = (axis: 0 | 1 | 2, value: string) => {
    const num = validateNumber(value, -10000, 10000);
    if (num !== null) {
      const currentCenter = field.centerPoint ?? [0, 0, 0];
      const newCenter: [number, number, number] = [
        currentCenter[0] ?? 0,
        currentCenter[1] ?? 0,
        currentCenter[2] ?? 0,
      ];
      newCenter[axis] = num;
      onUpdate({ centerPoint: newCenter });
      setErrors({ ...errors, [`center_${axis}`]: '' });
      clearLocalValue(`center_${axis}`);
    } else {
      setErrors({ ...errors, [`center_${axis}`]: 'Invalid value (-10000 to 10000)' });
    }
  };

  // ---- Line Start/End Points ----
  const handleLinePointChange = (pointKey: 'startPoint' | 'endPoint', axis: 0 | 1 | 2, value: string) => {
    const num = validateNumber(value, -10000, 10000);
    if (num !== null && field1D) {
      const currentPoint = field1D[pointKey] ?? [0, 0, 0];
      const newPoint: [number, number, number] = [
        currentPoint[0] ?? 0,
        currentPoint[1] ?? 0,
        currentPoint[2] ?? 0,
      ];
      newPoint[axis] = num;
      onUpdate({ [pointKey]: newPoint });
      setErrors({ ...errors, [`${pointKey}_${axis}`]: '' });
      clearLocalValue(`${pointKey}_${axis}`);
    } else {
      setErrors({ ...errors, [`${pointKey}_${axis}`]: 'Invalid value (-10000 to 10000)' });
    }
  };

  // ---- 1D numPoints ----
  const handleNumPointsChange = (value: string) => {
    const num = validateInteger(value, 2);
    if (num !== null) {
      onUpdate({ numPoints: num });
      setErrors({ ...errors, numPoints: '' });
      clearLocalValue('numPoints');
    } else {
      setErrors({ ...errors, numPoints: 'Must be integer ≥ 2' });
    }
  };

  // ---- Arc radii ----
  const handleArcRadiusChange = (key: 'radiusA' | 'radiusB', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null) {
      onUpdate({ [key]: num });
      setErrors({ ...errors, [key]: '' });
      clearLocalValue(key);
    } else {
      setErrors({ ...errors, [key]: 'Must be positive' });
    }
  };

  // ---- Arc angles ----
  const handleArcAngleChange = (key: 'startAngle' | 'endAngle', value: string) => {
    const num = validateNumber(value);
    if (num !== null) {
      onUpdate({ [key]: num });
      setErrors({ ...errors, [key]: '' });
      clearLocalValue(key);
    } else {
      setErrors({ ...errors, [key]: 'Invalid angle' });
    }
  };

  // ---- Arc axis vectors ----
  const handleArcAxisChange = (
    axisKey: 'axis1' | 'axis2',
    component: 0 | 1 | 2,
    value: string,
  ) => {
    const num = validateNumber(value);
    if (num !== null && field1D) {
      const cur = field1D[axisKey] ?? (axisKey === 'axis1' ? [1, 0, 0] : [0, 1, 0]);
      const newVec: [number, number, number] = [cur[0], cur[1], cur[2]];
      newVec[component] = num;
      if (validateNonZeroVector(newVec[0], newVec[1], newVec[2])) {
        const length = Math.sqrt(newVec[0] ** 2 + newVec[1] ** 2 + newVec[2] ** 2);
        const normalized: [number, number, number] = [
          newVec[0] / length,
          newVec[1] / length,
          newVec[2] / length,
        ];
        onUpdate({ [axisKey]: normalized, normalPreset: 'Custom' as NormalPreset });
        setErrors({ ...errors, [`arc_${axisKey}`]: '' });
      } else {
        setErrors({ ...errors, [`arc_${axisKey}`]: 'Axis vector cannot be zero' });
      }
    }
  };

  // ---- Arc orientation preset ----
  const handleArcNormalPresetChange = (preset: NormalPreset) => {
    if (preset === 'Custom') {
      onUpdate({ normalPreset: preset });
      return;
    }
    const { axis1, axis2 } = getEllipseAxesFromPreset(preset);
    onUpdate({ normalPreset: preset, axis1, axis2 });
  };

  // ---- Plane dimensions ----
  const handleDimensionChange = (key: 'width' | 'height', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null && field2D) {
      onUpdate({
        dimensions: { ...field2D.dimensions, [key]: num },
      });
      setErrors({ ...errors, [key]: '' });
      clearLocalValue(key);
    } else {
      setErrors({ ...errors, [key]: 'Must be positive' });
    }
  };

  // ---- Ellipse radii ----
  const handleEllipseRadiusChange = (key: 'radiusA' | 'radiusB', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null) {
      onUpdate({ [key]: num });
      setErrors({ ...errors, [key]: '' });
      clearLocalValue(key);
    } else {
      setErrors({ ...errors, [key]: 'Must be positive' });
    }
  };

  // ---- Ellipse / plane orientation preset ----
  const handleNormalPresetChange = (preset: NormalPreset) => {
    if (preset === 'Custom') {
      onUpdate({ normalPreset: preset });
      return;
    }
    if (field2D?.shape === 'ellipse') {
      const { axis1, axis2 } = getEllipseAxesFromPreset(preset);
      onUpdate({ normalPreset: preset, axis1, axis2 });
    } else {
      // Plane
      const presetVectors: Record<Exclude<NormalPreset, 'Custom'>, [number, number, number]> = {
        XY: [0, 0, 1],
        YZ: [1, 0, 0],
        XZ: [0, 1, 0],
      };
      onUpdate({ normalPreset: preset, normalVector: presetVectors[preset] });
    }
  };

  // ---- Plane custom normal vector ----
  const handleNormalVectorChange = (axis: 0 | 1 | 2, value: string) => {
    const num = validateNumber(value);
    if (num !== null && field2D) {
      const cur = field2D.normalVector ?? [0, 0, 1];
      const newNormal: [number, number, number] = [cur[0], cur[1], cur[2]];
      newNormal[axis] = num;
      if (validateNonZeroVector(newNormal[0], newNormal[1], newNormal[2])) {
        const length = Math.sqrt(newNormal[0] ** 2 + newNormal[1] ** 2 + newNormal[2] ** 2);
        const normalized: [number, number, number] = [
          newNormal[0] / length,
          newNormal[1] / length,
          newNormal[2] / length,
        ];
        onUpdate({ normalVector: normalized, normalPreset: 'Custom' as NormalPreset });
        setErrors({ ...errors, normalVector: '' });
      } else {
        setErrors({ ...errors, normalVector: 'Vector cannot be zero' });
      }
    }
  };

  // ---- Ellipse custom axis vectors ----
  const handleAxisVectorChange = (
    axisKey: 'axis1' | 'axis2',
    component: 0 | 1 | 2,
    value: string,
  ) => {
    const num = validateNumber(value);
    if (num !== null && field2D) {
      const cur = field2D[axisKey] ?? (axisKey === 'axis1' ? [1, 0, 0] : [0, 1, 0]);
      const newVec: [number, number, number] = [cur[0], cur[1], cur[2]];
      newVec[component] = num;
      if (validateNonZeroVector(newVec[0], newVec[1], newVec[2])) {
        const length = Math.sqrt(newVec[0] ** 2 + newVec[1] ** 2 + newVec[2] ** 2);
        const normalized: [number, number, number] = [
          newVec[0] / length,
          newVec[1] / length,
          newVec[2] / length,
        ];
        onUpdate({ [axisKey]: normalized, normalPreset: 'Custom' as NormalPreset });
        setErrors({ ...errors, [axisKey]: '' });
      } else {
        setErrors({ ...errors, [axisKey]: 'Axis vector cannot be zero' });
      }
    }
  };

  // ---- Cuboid dimensions ----
  const handleCuboidDimensionChange = (axis: 'Lx' | 'Ly' | 'Lz', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null && field3D) {
      onUpdate({
        cuboidDimensions: { ...field3D.cuboidDimensions, [axis]: num } as any,
      });
      setErrors({ ...errors, [axis]: '' });
      clearLocalValue(axis);
    } else {
      setErrors({ ...errors, [axis]: 'Must be positive' });
    }
  };

  // ---- Sphere radius ----
  const handleSphereRadiusChange = (value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null) {
      onUpdate({ sphereRadius: num });
      setErrors({ ...errors, sphereRadius: '' });
      clearLocalValue('sphereRadius');
    } else {
      setErrors({ ...errors, sphereRadius: 'Must be positive' });
    }
  };

  // ---- Sampling (generic for 2D/3D only) ----
  const handleSamplingChange = (key: string, value: string) => {
    if (field.type === '1D') return; // 1D uses numPoints, not sampling object
    const num = validateInteger(value, 2);
    if (num !== null) {
      const currentField = field as FieldDefinition2D | FieldDefinition3D;
      onUpdate({
        sampling: { ...currentField.sampling, [key]: num } as any,
      });
      setErrors({ ...errors, [`sampling_${key}`]: '' });
      clearLocalValue(`sampling_${key}`);
    } else {
      setErrors({ ...errors, [`sampling_${key}`]: 'Must be integer ≥ 2' });
    }
  };

  // ---- Field Type ----
  const handleFieldTypeChange = (type: 'E' | 'H' | 'poynting') => {
    onUpdate({ fieldType: type });
  };

  // ---- Sphere sampling helper (typed access) ----
  const sphereSampling: SphereSampling | undefined =
    field3D && 'theta' in field3D.sampling
      ? (field3D.sampling as SphereSampling)
      : undefined;

  // ---- Cuboid sampling helper (typed access) ----
  const cuboidSampling: CuboidSampling | undefined =
    field3D && 'Nx' in field3D.sampling
      ? (field3D.sampling as CuboidSampling)
      : undefined;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        {field.name || `Field ${field.id}`}
      </Typography>
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        Type: {field.type} Region
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      <TextField
        label="Field Name"
        size="small"
        fullWidth
        value={getLocalValue('name', field.name || '')}
        onBlur={(e) => handleNameChange(e.target.value)}
        onChange={(e) => setLocalValues({ ...localValues, name: e.target.value })}
        error={!!errors.name}
        helperText={errors.name || 'Identifier shown in the tree view'}
        InputLabelProps={{ shrink: true }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Region
        </Typography>
        <Typography variant="body2" color="text.primary" fontWeight={600}>
          {field.type.toUpperCase()} · {field.shape}
        </Typography>
      </Box>

      {/* Per-field opacity */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Opacity: {Math.round(getOpacityPercent())}%
        </Typography>
        <Slider
          value={getOpacityPercent()}
          onChange={handleOpacityChange}
          min={0}
          max={100}
          step={5}
          size="small"
          valueLabelDisplay="auto"
          valueLabelFormat={(value) => `${value}%`}
          aria-label="Field opacity"
          sx={{ mt: 1 }}
        />
      </Box>

      {/* ========== 1D Fields ========== */}
      {field1D && (
        <>
          {/* ---- Line ---- */}
          {field1D.shape === 'line' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Start Point (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                {([0, 1, 2] as const).map((i) => (
                  <TextField
                    key={i}
                    label={['X', 'Y', 'Z'][i]}
                    type="number"
                    size="small"
                    value={getLocalValue(`startPoint_${i}`, field1D.startPoint?.[i] ?? 0)}
                    onBlur={(e) => handleLinePointChange('startPoint', i, e.target.value)}
                    onChange={(e) => setLocalValues({ ...localValues, [`startPoint_${i}`]: e.target.value })}
                    error={!!errors[`startPoint_${i}`]}
                    helperText={errors[`startPoint_${i}`]}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                ))}
              </Box>

              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                End Point (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                {([0, 1, 2] as const).map((i) => (
                  <TextField
                    key={i}
                    label={['X', 'Y', 'Z'][i]}
                    type="number"
                    size="small"
                    value={getLocalValue(`endPoint_${i}`, field1D.endPoint?.[i] ?? 0)}
                    onBlur={(e) => handleLinePointChange('endPoint', i, e.target.value)}
                    onChange={(e) => setLocalValues({ ...localValues, [`endPoint_${i}`]: e.target.value })}
                    error={!!errors[`endPoint_${i}`]}
                    helperText={errors[`endPoint_${i}`]}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                ))}
              </Box>

              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sampling:
              </Typography>
              <TextField
                label="Number of Points"
                type="number"
                size="small"
                fullWidth
                value={getLocalValue('numPoints', field1D.numPoints ?? 10)}
                onBlur={(e) => handleNumPointsChange(e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, numPoints: e.target.value })}
                error={!!errors.numPoints}
                helperText={errors.numPoints || 'Uniformly distributed along the line'}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {/* ---- Arc ---- */}
          {field1D.shape === 'arc' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Center Point (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                {([0, 1, 2] as const).map((i) => (
                  <TextField
                    key={i}
                    label={['X', 'Y', 'Z'][i]}
                    type="number"
                    size="small"
                    value={getLocalValue(`center_${i}`, field1D.centerPoint?.[i] ?? 0)}
                    onBlur={(e) => handleCenterChange(i, e.target.value)}
                    onChange={(e) => setLocalValues({ ...localValues, [`center_${i}`]: e.target.value })}
                    error={!!errors[`center_${i}`]}
                    helperText={errors[`center_${i}`]}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                ))}
              </Box>

              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Radii (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Radius A"
                  type="number"
                  size="small"
                  value={getLocalValue('radiusA', field1D.radiusA ?? 100)}
                  onBlur={(e) => handleArcRadiusChange('radiusA', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, radiusA: e.target.value })}
                  error={!!errors.radiusA}
                  helperText={errors.radiusA || 'Along Axis 1'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Radius B"
                  type="number"
                  size="small"
                  value={getLocalValue('radiusB', field1D.radiusB ?? 100)}
                  onBlur={(e) => handleArcRadiusChange('radiusB', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, radiusB: e.target.value })}
                  error={!!errors.radiusB}
                  helperText={errors.radiusB || 'Along Axis 2'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* Arc Orientation Preset */}
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Orientation</InputLabel>
                <Select
                  value={field1D.normalPreset || 'XY'}
                  label="Orientation"
                  onChange={(e) => handleArcNormalPresetChange(e.target.value as NormalPreset)}
                >
                  <MenuItem value="XY">XY Plane</MenuItem>
                  <MenuItem value="YZ">YZ Plane</MenuItem>
                  <MenuItem value="XZ">XZ Plane</MenuItem>
                  <MenuItem value="Custom">Custom</MenuItem>
                </Select>
              </FormControl>

              {/* Custom Axis inputs */}
              {field1D.normalPreset === 'Custom' && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Axis 1 (0° direction):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    {([0, 1, 2] as const).map((i) => (
                      <TextField
                        key={i}
                        label={['X', 'Y', 'Z'][i]}
                        type="number"
                        size="small"
                        value={getLocalValue(`arc_axis1_${i}`, field1D.axis1?.[i] ?? [1, 0, 0][i])}
                        onBlur={(e) => handleArcAxisChange('axis1', i, e.target.value)}
                        onChange={(e) =>
                          setLocalValues({ ...localValues, [`arc_axis1_${i}`]: e.target.value })
                        }
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 0.1 }}
                        sx={{ flex: 1 }}
                      />
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Axis 2 (90° direction):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {([0, 1, 2] as const).map((i) => (
                      <TextField
                        key={i}
                        label={['X', 'Y', 'Z'][i]}
                        type="number"
                        size="small"
                        value={getLocalValue(`arc_axis2_${i}`, field1D.axis2?.[i] ?? [0, 1, 0][i])}
                        onBlur={(e) => handleArcAxisChange('axis2', i, e.target.value)}
                        onChange={(e) =>
                          setLocalValues({ ...localValues, [`arc_axis2_${i}`]: e.target.value })
                        }
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 0.1 }}
                        sx={{ flex: 1 }}
                      />
                    ))}
                  </Box>
                  {(errors.arc_axis1 || errors.arc_axis2) && (
                    <FormHelperText error>
                      {errors.arc_axis1 || errors.arc_axis2}
                    </FormHelperText>
                  )}
                </Box>
              )}

              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Arc Angles (degrees):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Start Angle"
                  type="number"
                  size="small"
                  value={getLocalValue('startAngle', field1D.startAngle ?? 0)}
                  onBlur={(e) => handleArcAngleChange('startAngle', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, startAngle: e.target.value })}
                  error={!!errors.startAngle}
                  helperText={errors.startAngle || '0° = along Axis 1'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="End Angle"
                  type="number"
                  size="small"
                  value={getLocalValue('endAngle', field1D.endAngle ?? 360)}
                  onBlur={(e) => handleArcAngleChange('endAngle', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, endAngle: e.target.value })}
                  error={!!errors.endAngle}
                  helperText={errors.endAngle || '360° = full ellipse'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sampling:
              </Typography>
              <TextField
                label="Number of Points"
                type="number"
                size="small"
                fullWidth
                value={getLocalValue('numPoints', field1D.numPoints ?? 10)}
                onBlur={(e) => handleNumPointsChange(e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, numPoints: e.target.value })}
                error={!!errors.numPoints}
                helperText={errors.numPoints || 'Uniformly distributed along the arc'}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            </>
          )}
        </>
      )}

      {/* Center Point (for 2D and 3D fields) */}
      {(field2D || field3D) && (
        <>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Center Point (mm):
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {([0, 1, 2] as const).map((i) => (
              <TextField
                key={i}
                label={['X', 'Y', 'Z'][i]}
                type="number"
                size="small"
                value={getLocalValue(`center_${i}`, field.centerPoint?.[i] ?? 0)}
                onBlur={(e) => handleCenterChange(i, e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, [`center_${i}`]: e.target.value })}
                error={!!errors[`center_${i}`]}
                helperText={errors[`center_${i}`]}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            ))}
          </Box>
        </>
      )}

      {/* ========== 2D Fields ========== */}
      {field2D && (
        <>
          {/* ---- Plane ---- */}
          {field2D.shape === 'plane' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Plane Dimensions (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Width"
                  type="number"
                  size="small"
                  value={getLocalValue('width', field2D.dimensions?.width || 100)}
                  onBlur={(e) => handleDimensionChange('width', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, width: e.target.value })}
                  error={!!errors.width}
                  helperText={errors.width}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Height"
                  type="number"
                  size="small"
                  value={getLocalValue('height', field2D.dimensions?.height || 100)}
                  onBlur={(e) => handleDimensionChange('height', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, height: e.target.value })}
                  error={!!errors.height}
                  helperText={errors.height}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* Normal Direction Preset */}
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Normal Direction</InputLabel>
                <Select
                  value={field2D.normalPreset || 'XY'}
                  label="Normal Direction"
                  onChange={(e) => handleNormalPresetChange(e.target.value as NormalPreset)}
                >
                  <MenuItem value="XY">XY Plane (Z normal)</MenuItem>
                  <MenuItem value="YZ">YZ Plane (X normal)</MenuItem>
                  <MenuItem value="XZ">XZ Plane (Y normal)</MenuItem>
                  <MenuItem value="Custom">Custom</MenuItem>
                </Select>
              </FormControl>

              {/* Custom Normal Vector inputs */}
              {field2D.normalPreset === 'Custom' && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Custom Normal Vector:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {([0, 1, 2] as const).map((i) => (
                      <TextField
                        key={i}
                        label={['nX', 'nY', 'nZ'][i]}
                        type="number"
                        size="small"
                        value={getLocalValue(
                          `normal_${i}`,
                          field2D.normalVector?.[i] ?? [0, 0, 1][i],
                        )}
                        onBlur={(e) => handleNormalVectorChange(i, e.target.value)}
                        onChange={(e) =>
                          setLocalValues({ ...localValues, [`normal_${i}`]: e.target.value })
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                      />
                    ))}
                  </Box>
                  {errors.normalVector && (
                    <FormHelperText error>{errors.normalVector}</FormHelperText>
                  )}
                </Box>
              )}

              {/* Show resolved normal when not custom */}
              {field2D.normalPreset !== 'Custom' && field2D.normalVector && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Normal: ({field2D.normalVector[0].toFixed(2)},{' '}
                    {field2D.normalVector[1].toFixed(2)},{' '}
                    {field2D.normalVector[2].toFixed(2)})
                  </Typography>
                </Box>
              )}
            </>
          )}

          {/* ---- Ellipse ---- */}
          {field2D.shape === 'ellipse' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Ellipse Radii (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Radius A"
                  type="number"
                  size="small"
                  value={getLocalValue('radiusA', field2D.radiusA || 50)}
                  onBlur={(e) => handleEllipseRadiusChange('radiusA', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, radiusA: e.target.value })}
                  error={!!errors.radiusA}
                  helperText={errors.radiusA || 'Along axis 1'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Radius B"
                  type="number"
                  size="small"
                  value={getLocalValue('radiusB', field2D.radiusB || 50)}
                  onBlur={(e) => handleEllipseRadiusChange('radiusB', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, radiusB: e.target.value })}
                  error={!!errors.radiusB}
                  helperText={errors.radiusB || 'Along axis 2'}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* Orientation Preset */}
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Orientation</InputLabel>
                <Select
                  value={field2D.normalPreset || 'XY'}
                  label="Orientation"
                  onChange={(e) => handleNormalPresetChange(e.target.value as NormalPreset)}
                >
                  <MenuItem value="XY">XY Plane</MenuItem>
                  <MenuItem value="YZ">YZ Plane</MenuItem>
                  <MenuItem value="XZ">XZ Plane</MenuItem>
                  <MenuItem value="Custom">Custom Axes</MenuItem>
                </Select>
              </FormControl>

              {/* Custom axis vectors */}
              {field2D.normalPreset === 'Custom' && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Axis 1 (direction of radius A):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    {([0, 1, 2] as const).map((i) => (
                      <TextField
                        key={i}
                        label={['X', 'Y', 'Z'][i]}
                        type="number"
                        size="small"
                        value={getLocalValue(
                          `axis1_${i}`,
                          field2D.axis1?.[i] ?? [1, 0, 0][i],
                        )}
                        onBlur={(e) => handleAxisVectorChange('axis1', i, e.target.value)}
                        onChange={(e) =>
                          setLocalValues({ ...localValues, [`axis1_${i}`]: e.target.value })
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                      />
                    ))}
                  </Box>
                  {errors.axis1 && <FormHelperText error>{errors.axis1}</FormHelperText>}

                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Axis 2 (direction of radius B):
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    {([0, 1, 2] as const).map((i) => (
                      <TextField
                        key={i}
                        label={['X', 'Y', 'Z'][i]}
                        type="number"
                        size="small"
                        value={getLocalValue(
                          `axis2_${i}`,
                          field2D.axis2?.[i] ?? [0, 1, 0][i],
                        )}
                        onBlur={(e) => handleAxisVectorChange('axis2', i, e.target.value)}
                        onChange={(e) =>
                          setLocalValues({ ...localValues, [`axis2_${i}`]: e.target.value })
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={{ flex: 1 }}
                      />
                    ))}
                  </Box>
                  {errors.axis2 && <FormHelperText error>{errors.axis2}</FormHelperText>}
                </Box>
              )}

              {/* Resolved axes display when preset */}
              {field2D.normalPreset !== 'Custom' && field2D.axis1 && field2D.axis2 && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Axis 1: ({field2D.axis1[0]}, {field2D.axis1[1]}, {field2D.axis1[2]})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Axis 2: ({field2D.axis2[0]}, {field2D.axis2[1]}, {field2D.axis2[2]})
                  </Typography>
                </Box>
              )}
            </>
          )}

          {/* 2D Sampling Resolution */}
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Sampling Resolution:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label={field2D.shape === 'ellipse' ? 'Angular' : 'Points X'}
              type="number"
              size="small"
              value={getLocalValue('sampling_x', field2D.sampling.x)}
              onBlur={(e) => handleSamplingChange('x', e.target.value)}
              onChange={(e) => setLocalValues({ ...localValues, sampling_x: e.target.value })}
              error={!!errors.sampling_x}
              helperText={errors.sampling_x}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={field2D.shape === 'ellipse' ? 'Radial' : 'Points Y'}
              type="number"
              size="small"
              value={getLocalValue('sampling_y', field2D.sampling.y)}
              onBlur={(e) => handleSamplingChange('y', e.target.value)}
              onChange={(e) => setLocalValues({ ...localValues, sampling_y: e.target.value })}
              error={!!errors.sampling_y}
              helperText={errors.sampling_y}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>
        </>
      )}

      {/* ========== 3D Fields ========== */}
      {field3D && (
        <>
          {/* ---- Sphere ---- */}
          {field3D.shape === 'sphere' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sphere Radius (mm):
              </Typography>
              <TextField
                label="Radius"
                type="number"
                size="small"
                fullWidth
                value={getLocalValue('sphereRadius', field3D.sphereRadius || 150)}
                onBlur={(e) => handleSphereRadiusChange(e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, sphereRadius: e.target.value })}
                error={!!errors.sphereRadius}
                helperText={errors.sphereRadius}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />

              {/* Sphere Sampling: theta, phi, radial */}
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sampling Resolution:
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <TextField
                  label="Theta (elevation)"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_theta', sphereSampling?.theta ?? 10)}
                  onBlur={(e) => handleSamplingChange('theta', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_theta: e.target.value })
                  }
                  error={!!errors.sampling_theta}
                  helperText={errors.sampling_theta || '0° to 180°'}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Phi (azimuth)"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_phi', sphereSampling?.phi ?? 20)}
                  onBlur={(e) => handleSamplingChange('phi', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_phi: e.target.value })
                  }
                  error={!!errors.sampling_phi}
                  helperText={errors.sampling_phi || '0° to 360°'}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Radial layers"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_radial', sphereSampling?.radial ?? 5)}
                  onBlur={(e) => handleSamplingChange('radial', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_radial: e.target.value })
                  }
                  error={!!errors.sampling_radial}
                  helperText={errors.sampling_radial}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            </>
          )}

          {/* ---- Cuboid ---- */}
          {field3D.shape === 'cuboid' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Cuboid Dimensions (mm):
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <TextField
                  label="Length X"
                  type="number"
                  size="small"
                  value={getLocalValue('Lx', field3D.cuboidDimensions?.Lx || 100)}
                  onBlur={(e) => handleCuboidDimensionChange('Lx', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Lx: e.target.value })}
                  error={!!errors.Lx}
                  helperText={errors.Lx}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Length Y"
                  type="number"
                  size="small"
                  value={getLocalValue('Ly', field3D.cuboidDimensions?.Ly || 100)}
                  onBlur={(e) => handleCuboidDimensionChange('Ly', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Ly: e.target.value })}
                  error={!!errors.Ly}
                  helperText={errors.Ly}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Length Z"
                  type="number"
                  size="small"
                  value={getLocalValue('Lz', field3D.cuboidDimensions?.Lz || 100)}
                  onBlur={(e) => handleCuboidDimensionChange('Lz', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Lz: e.target.value })}
                  error={!!errors.Lz}
                  helperText={errors.Lz}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>

              {/* Cuboid Sampling: Nx, Ny, Nz */}
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sampling Resolution:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Nx"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_Nx', cuboidSampling?.Nx ?? 10)}
                  onBlur={(e) => handleSamplingChange('Nx', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_Nx: e.target.value })
                  }
                  error={!!errors.sampling_Nx}
                  helperText={errors.sampling_Nx}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Ny"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_Ny', cuboidSampling?.Ny ?? 10)}
                  onBlur={(e) => handleSamplingChange('Ny', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_Ny: e.target.value })
                  }
                  error={!!errors.sampling_Ny}
                  helperText={errors.sampling_Ny}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Nz"
                  type="number"
                  size="small"
                  value={getLocalValue('sampling_Nz', cuboidSampling?.Nz ?? 10)}
                  onBlur={(e) => handleSamplingChange('Nz', e.target.value)}
                  onChange={(e) =>
                    setLocalValues({ ...localValues, sampling_Nz: e.target.value })
                  }
                  error={!!errors.sampling_Nz}
                  helperText={errors.sampling_Nz}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>
            </>
          )}
        </>
      )}

      {/* Field Type */}
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        Field Type:
      </Typography>
      <RadioGroup
        value={field.fieldType}
        onChange={(e) => handleFieldTypeChange(e.target.value as 'E' | 'H' | 'poynting')}
        sx={{ mb: 2 }}
      >
        <FormControlLabel
          value="E"
          control={<Radio size="small" />}
          label="E-field (Electric)"
        />
        <FormControlLabel
          value="H"
          control={<Radio size="small" />}
          label="H-field (Magnetic)"
        />
        <FormControlLabel
          value="poynting"
          control={<Radio size="small" />}
          label="Poynting (S)"
        />
      </RadioGroup>

      {/* Delete Button */}
      <Button
        variant="outlined"
        color="error"
        fullWidth
        onClick={onDelete}
        sx={{ mt: 2 }}
      >
        Delete Field
      </Button>
    </Paper>
  );
}

/**
 * DirectivitySettingsEditor - Editor for directivity discretization parameters
 */
interface DirectivitySettingsEditorProps {
  settings: { theta_points: number; phi_points: number };
  onUpdate: (settings: { theta_points: number; phi_points: number }) => void;
}

function DirectivitySettingsEditor({ settings, onUpdate }: DirectivitySettingsEditorProps) {
  const [thetaPoints, setThetaPoints] = useState(settings.theta_points);
  const [phiPoints, setPhiPoints] = useState(settings.phi_points);
  const [thetaError, setThetaError] = useState<string | null>(null);
  const [phiError, setPhiError] = useState<string | null>(null);

  const validateAndUpdate = (newTheta: number, newPhi: number) => {
    let valid = true;

    if (newTheta < 5 || newTheta > 180) {
      setThetaError('Must be between 5 and 180');
      valid = false;
    } else {
      setThetaError(null);
    }

    if (newPhi < 5 || newPhi > 360) {
      setPhiError('Must be between 5 and 360');
      valid = false;
    } else {
      setPhiError(null);
    }

    if (valid) {
      onUpdate({ theta_points: newTheta, phi_points: newPhi });
    }
  };

  const handleThetaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setThetaPoints(value);
  };

  const handleThetaBlur = () => {
    validateAndUpdate(thetaPoints, phiPoints);
  };

  const handlePhiChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    setPhiPoints(value);
  };

  const handlePhiBlur = () => {
    validateAndUpdate(thetaPoints, phiPoints);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Directivity
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Configure the angular discretization for far-field radiation pattern computation.
      </Typography>

      {/* Theta Points */}
      <TextField
        fullWidth
        label="Theta Points (Elevation)"
        type="number"
        value={thetaPoints}
        onChange={handleThetaChange}
        onBlur={handleThetaBlur}
        error={!!thetaError}
        helperText={thetaError || 'Number of points from 0° to 180°'}
        inputProps={{ min: 5, max: 180, step: 1 }}
        size="small"
        sx={{ mb: 2 }}
      />

      {/* Phi Points */}
      <TextField
        fullWidth
        label="Phi Points (Azimuth)"
        type="number"
        value={phiPoints}
        onChange={handlePhiChange}
        onBlur={handlePhiBlur}
        error={!!phiError}
        helperText={phiError || 'Number of points from 0° to 360°'}
        inputProps={{ min: 5, max: 360, step: 1 }}
        size="small"
        sx={{ mb: 2 }}
      />

      {/* Info */}
      <Box sx={{ bgcolor: 'info.lighter', p: 1.5, borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Total sample points:</strong> {thetaPoints * phiPoints}
          <br />
          <strong>Note:</strong> Changes will require recomputation of the directivity pattern.
        </Typography>
      </Box>
    </Paper>
  );
}
