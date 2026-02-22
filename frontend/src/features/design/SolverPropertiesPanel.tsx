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
import type { FieldDefinition, NormalPreset } from '@/types/fieldDefinitions';

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
          Field Region Display
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

  const validateNormalVector = (x: number, y: number, z: number): boolean => {
    const length = Math.sqrt(x * x + y * y + z * z);
    return length > 0.001; // Non-zero check
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

  // Get local value or field value
  const getLocalValue = (key: string, defaultValue: string | number): string => {
    if (localValues[key] !== undefined) return localValues[key];
    if (defaultValue === undefined || defaultValue === null) return '';
    return String(defaultValue);
  };

  const clearLocalValue = (key: string) => {
    const { [key]: _removed, ...rest } = localValues;
    setLocalValues(rest);
  };

  // Handlers for center point
  const handleCenterChange = (axis: 0 | 1 | 2, value: string) => {
    const num = validateNumber(value, -10000, 10000);
    if (num !== null) {
      const newCenter: [number, number, number] = [
        field.centerPoint[0] ?? 0,
        field.centerPoint[1] ?? 0,
        field.centerPoint[2] ?? 0,
      ];
      newCenter[axis] = num;
      onUpdate({ centerPoint: newCenter });
      setErrors({ ...errors, [`center_${axis}`]: '' });
      clearLocalValue(`center_${axis}`);
    } else {
      setErrors({ ...errors, [`center_${axis}`]: 'Invalid value (-10000 to 10000)' });
    }
  };

  // Handlers for 2D dimensions
  const handleDimensionChange = (key: 'width' | 'height' | 'radius', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null) {
      onUpdate({
        dimensions: { ...field.type === '2D' ? field.dimensions : {}, [key]: num }
      });
      setErrors({ ...errors, [key]: '' });
      clearLocalValue(key);
    } else {
      setErrors({ ...errors, [key]: 'Must be positive' });
    }
  };

  // Handlers for 3D dimensions
  const handleCubeDimensionChange = (axis: 'Lx' | 'Ly' | 'Lz', value: string) => {
    const num = validateNumber(value, 0.1);
    if (num !== null && field.type === '3D') {
      onUpdate({
        cubeDimensions: { ...field.cubeDimensions, [axis]: num } as any
      });
      setErrors({ ...errors, [axis]: '' });
      clearLocalValue(axis);
    } else {
      setErrors({ ...errors, [axis]: 'Must be positive' });
    }
  };

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

  // Handlers for sampling
  const handleSamplingChange = (key: string, value: string) => {
    const num = validateInteger(value, 2);
    if (num !== null) {
      onUpdate({
        sampling: { ...field.sampling, [key]: num } as any
      });
      setErrors({ ...errors, [`sampling_${key}`]: '' });
      clearLocalValue(`sampling_${key}`);
    } else {
      setErrors({ ...errors, [`sampling_${key}`]: 'Must be integer ≥ 2' });
    }
  };

  // Handler for normal preset
  const handleNormalPresetChange = (preset: NormalPreset) => {
    if (preset === 'Custom') {
      // For Custom, just set the preset without changing the vector
      onUpdate({ normalPreset: preset });
      return;
    }
    const presetVectors: Record<Exclude<NormalPreset, 'Custom'>, [number, number, number]> = {
      'XY': [0, 0, 1],
      'YZ': [1, 0, 0],
      'XZ': [0, 1, 0],
    };
    onUpdate({
      normalPreset: preset,
      normalVector: presetVectors[preset]
    });
  };

  // Handler for custom normal vector
  const handleNormalVectorChange = (axis: 0 | 1 | 2, value: string) => {
    const num = validateNumber(value);
    if (num !== null && field.type === '2D') {
      const newNormal: [number, number, number] = [
        field.normalVector?.[0] ?? 0,
        field.normalVector?.[1] ?? 0,
        field.normalVector?.[2] ?? 1,
      ];
      newNormal[axis] = num;

      if (validateNormalVector(newNormal[0], newNormal[1], newNormal[2])) {
        // Normalize the vector
        const length = Math.sqrt(newNormal[0]**2 + newNormal[1]**2 + newNormal[2]**2);
        const normalized: [number, number, number] = [
          newNormal[0] / length,
          newNormal[1] / length,
          newNormal[2] / length,
        ];
        onUpdate({
          normalVector: normalized,
          normalPreset: 'XY' as NormalPreset // Reset preset when custom
        });
        setErrors({ ...errors, normalVector: '' });
      } else {
        setErrors({ ...errors, normalVector: 'Vector cannot be zero' });
      }
    }
  };

  // Handler for field type
  const handleFieldTypeChange = (type: 'E' | 'H' | 'poynting') => {
    onUpdate({ fieldType: type });
  };

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

      {/* Center Point */}
      <Typography variant="caption" color="text.secondary" gutterBottom display="block">
        Center Point (mm):
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          label="X"
          type="number"
          size="small"
          value={getLocalValue('center_0', field.centerPoint[0])}
          onBlur={(e) => handleCenterChange(0, e.target.value)}
          onChange={(e) => setLocalValues({ ...localValues, center_0: e.target.value })}
          error={!!errors.center_0}
          helperText={errors.center_0}
          InputLabelProps={{ shrink: true }}
          sx={{ flex: 1 }}
        />
        <TextField
          label="Y"
          type="number"
          size="small"
          value={getLocalValue('center_1', field.centerPoint[1])}
          onBlur={(e) => handleCenterChange(1, e.target.value)}
          onChange={(e) => setLocalValues({ ...localValues, center_1: e.target.value })}
          error={!!errors.center_1}
          helperText={errors.center_1}
          InputLabelProps={{ shrink: true }}
          sx={{ flex: 1 }}
        />
        <TextField
          label="Z"
          type="number"
          size="small"
          value={getLocalValue('center_2', field.centerPoint[2])}
          onBlur={(e) => handleCenterChange(2, e.target.value)}
          onChange={(e) => setLocalValues({ ...localValues, center_2: e.target.value })}
          error={!!errors.center_2}
          helperText={errors.center_2}
          InputLabelProps={{ shrink: true }}
          sx={{ flex: 1 }}
        />
      </Box>

      {/* 2D Dimensions */}
      {field.type === '2D' && (
        <>
          {field.shape === 'plane' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Plane Dimensions (mm):
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Width (X)"
                  type="number"
                  size="small"
                  value={getLocalValue('width', field.dimensions?.width || 100)}
                  onBlur={(e) => handleDimensionChange('width', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, width: e.target.value })}
                  error={!!errors.width}
                  helperText={errors.width}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Height (Y)"
                  type="number"
                  size="small"
                  value={getLocalValue('height', field.dimensions?.height || 100)}
                  onBlur={(e) => handleDimensionChange('height', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, height: e.target.value })}
                  error={!!errors.height}
                  helperText={errors.height}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              {/* Normal Vector */}
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Normal Direction</InputLabel>
                <Select
                  value={field.normalPreset || 'XY'}
                  label="Normal Direction"
                  onChange={(e) => handleNormalPresetChange(e.target.value as NormalPreset)}
                >
                  <MenuItem value="XY">XY Plane (Z normal)</MenuItem>
                  <MenuItem value="YZ">YZ Plane (X normal)</MenuItem>
                  <MenuItem value="XZ">XZ Plane (Y normal)</MenuItem>
                </Select>
              </FormControl>

              {/* Custom Normal Vector (if needed) */}
              {field.normalVector && (
                <Box sx={{ pl: 2, mb: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Normal Vector: ({field.normalVector[0].toFixed(2)}, {field.normalVector[1].toFixed(2)}, {field.normalVector[2].toFixed(2)})
                  </Typography>
                  {errors.normalVector && (
                    <FormHelperText error>{errors.normalVector}</FormHelperText>
                  )}
                </Box>
              )}
            </>
          )}

          {field.shape === 'circle' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Circle Radius (mm):
              </Typography>
              <TextField
                label="Radius"
                type="number"
                size="small"
                fullWidth
                value={getLocalValue('radius', field.dimensions?.radius || 50)}
                onBlur={(e) => handleDimensionChange('radius', e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, radius: e.target.value })}
                error={!!errors.radius}
                helperText={errors.radius}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {/* Sampling Resolution for 2D */}
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Sampling Resolution:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Points in X"
              type="number"
              size="small"
              value={getLocalValue('sampling_x', field.sampling.x)}
              onBlur={(e) => handleSamplingChange('x', e.target.value)}
              onChange={(e) => setLocalValues({ ...localValues, sampling_x: e.target.value })}
              error={!!errors.sampling_x}
              helperText={errors.sampling_x}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Points in Y"
              type="number"
              size="small"
              value={getLocalValue('sampling_y', field.sampling.y)}
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

      {/* 3D Dimensions */}
      {field.type === '3D' && (
        <>
          {field.shape === 'sphere' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Sphere Radius (mm):
              </Typography>
              <TextField
                label="Radius"
                type="number"
                size="small"
                fullWidth
                value={getLocalValue('sphereRadius', field.sphereRadius || 150)}
                onBlur={(e) => handleSphereRadiusChange(e.target.value)}
                onChange={(e) => setLocalValues({ ...localValues, sphereRadius: e.target.value })}
                error={!!errors.sphereRadius}
                helperText={errors.sphereRadius}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            </>
          )}

          {field.shape === 'cube' && (
            <>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Cube Dimensions (mm):
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <TextField
                  label="Length X"
                  type="number"
                  size="small"
                  value={getLocalValue('Lx', field.cubeDimensions?.Lx || 100)}
                  onBlur={(e) => handleCubeDimensionChange('Lx', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Lx: e.target.value })}
                  error={!!errors.Lx}
                  helperText={errors.Lx}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Length Y"
                  type="number"
                  size="small"
                  value={getLocalValue('Ly', field.cubeDimensions?.Ly || 100)}
                  onBlur={(e) => handleCubeDimensionChange('Ly', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Ly: e.target.value })}
                  error={!!errors.Ly}
                  helperText={errors.Ly}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Length Z"
                  type="number"
                  size="small"
                  value={getLocalValue('Lz', field.cubeDimensions?.Lz || 100)}
                  onBlur={(e) => handleCubeDimensionChange('Lz', e.target.value)}
                  onChange={(e) => setLocalValues({ ...localValues, Lz: e.target.value })}
                  error={!!errors.Lz}
                  helperText={errors.Lz}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>
            </>
          )}

          {/* Sampling Resolution for 3D */}
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">
            Sampling Resolution:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Radial Points"
              type="number"
              size="small"
              value={getLocalValue('sampling_radial', field.sampling.radial)}
              onBlur={(e) => handleSamplingChange('radial', e.target.value)}
              onChange={(e) => setLocalValues({ ...localValues, sampling_radial: e.target.value })}
              error={!!errors.sampling_radial}
              helperText={errors.sampling_radial}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Angular Points"
              type="number"
              size="small"
              value={getLocalValue('sampling_angular', field.sampling.angular)}
              onBlur={(e) => handleSamplingChange('angular', e.target.value)}
              onChange={(e) => setLocalValues({ ...localValues, sampling_angular: e.target.value })}
              error={!!errors.sampling_angular}
              helperText={errors.sampling_angular}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>
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
