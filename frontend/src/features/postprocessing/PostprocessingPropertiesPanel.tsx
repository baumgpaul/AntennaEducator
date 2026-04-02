import React from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  Button,
  Slider,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  Radio,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ValueRangeInput from '../../components/common/ValueRangeInput';
import SliderWithInput from '../../components/common/SliderWithInput';
import { computeAutoRange } from '../design/PostprocessingTab';
import type { FieldDefinition } from '@/types/fieldDefinitions';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectSelectedView,
  selectSelectedItem,
  renameViewConfiguration,
  deleteViewConfiguration,
  updateItemProperty,
  toggleItemVisibility,
} from '../../store/postprocessingSlice';
import { selectSelectedFrequencyHz } from '../../store/solverSlice';

/**
 * Get ordinal suffix for density numbers (1st, 2nd, 3rd, 4th, etc.)
 */
function getDensitySuffix(n: number): string {
  if (n === 1) return '';
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return suffix[(v - 20) % 10] || suffix[v] || suffix[0];
}

/**
 * PostprocessingPropertiesPanel - Right-side properties editor for postprocessing views and items
 *
 * Displays:
 * - Empty state when no view selected
 * - View-level properties (name, type, frequency slider, delete)
 * - Item-specific properties (10 types with custom controls)
 */
const PostprocessingPropertiesPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedView = useAppSelector(selectSelectedView);
  const selectedItem = useAppSelector(selectSelectedItem);
  const solverResults = useAppSelector((state) => state.solver.results);
  const frequencySweep = useAppSelector((state) => state.solver.frequencySweep);
  const fieldData = useAppSelector((state) => state.solver.fieldData);
  const radiationPattern = useAppSelector((state) => state.solver.radiationPattern);
  const selectedFrequencyHz = useAppSelector(selectSelectedFrequencyHz);
  const requestedFields = useAppSelector((state) => state.solver.requestedFields) as FieldDefinition[];

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [viewName, setViewName] = React.useState('');
  const [itemLabel, setItemLabel] = React.useState('');

  // Update local state when selection changes
  React.useEffect(() => {
    if (selectedView) {
      setViewName(selectedView.name);
    }
  }, [selectedView?.id, selectedView?.name]);

  React.useEffect(() => {
    if (selectedItem) {
      setItemLabel(selectedItem.label);
    }
  }, [selectedItem?.id, selectedItem?.label]);

  // Empty state: No view selected
  if (!selectedView) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No view selected
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Create a view to get started
        </Typography>
      </Box>
    );
  }

  // Calculate computed frequencies (in MHz) from frequency sweep or solver results
  const computedFrequenciesMHz = frequencySweep?.frequencies
    ? frequencySweep.frequencies.map((freqHz) => freqHz / 1e6).sort((a, b) => a - b)
    : solverResults
    ? Object.keys(solverResults)
        .map((freqStr) => parseFloat(freqStr) / 1e6)
        .filter((freq) => !isNaN(freq))
        .sort((a, b) => a - b)
    : [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasMultipleFrequencies = computedFrequenciesMHz.length > 1;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasAnyFrequencies = computedFrequenciesMHz.length > 0;

  // Get current frequency, defaulting to first computed frequency if not set
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const currentFrequencyMHz = selectedView?.selectedFrequencyHz
    ? selectedView.selectedFrequencyHz / 1e6
    : (computedFrequenciesMHz.length > 0 ? computedFrequenciesMHz[0] : null);

  // Handlers
  const handleNameChange = (event: React.FocusEvent<HTMLInputElement>) => {
    const newName = event.target.value.trim();
    if (newName && newName !== selectedView?.name) {
      dispatch(renameViewConfiguration({ viewId: selectedView!.id, name: newName }));
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    dispatch(deleteViewConfiguration(selectedView.id));
    setDeleteDialogOpen(false);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // Item property handlers (to be implemented with item editors)
  const handleItemPropertyChange = (property: keyof import('../../types/postprocessing').ViewItem, value: any) => {
    if (selectedItem) {
      dispatch(updateItemProperty({
        viewId: selectedView.id,
        itemId: selectedItem.id,
        property,
        value,
      }));
    }
  };

  const handleItemVisibilityToggle = () => {
    if (selectedItem) {
      dispatch(toggleItemVisibility({
        viewId: selectedView.id,
        itemId: selectedItem.id,
      }));
    }
  };

  // Render the "Show Colorbar" toggle (reused for all color-mapped item types)
  const renderColorbarToggle = () => (
    <FormControlLabel
      control={
        <Checkbox
          checked={selectedItem?.showColorbar !== false}
          onChange={(e) => handleItemPropertyChange('showColorbar', e.target.checked)}
          size="small"
        />
      }
      label="Show Colorbar"
      sx={{ mb: 1 }}
    />
  );

  // Render type-specific property editors
  const renderItemTypeProperties = () => {
    if (!selectedItem) return null;

    // Compute auto range for current item (used for auto→manual default values)
    const displayFrequencyHz = selectedFrequencyHz ?? null;
    const autoRange = computeAutoRange(
      selectedItem,
      solverResults,
      fieldData,
      radiationPattern,
      displayFrequencyHz,
      requestedFields,
    );

    // Handler to save manual range values when switching to auto
    const handleSaveManualRange = (savedMin: number, savedMax: number) => {
      handleItemPropertyChange('savedManualMin', savedMin);
      handleItemPropertyChange('savedManualMax', savedMax);
    };

    const commonProps = {
      opacity: selectedItem.opacity ?? 0.8,
      color: selectedItem.color ?? '#FF8C00',
      colorMap: selectedItem.colorMap ?? 'jet',
      showColorbar: selectedItem.showColorbar !== false,
      valueRangeMode: selectedItem.valueRangeMode ?? 'auto',
      valueRangeMin: selectedItem.valueRangeMin ?? 0,
      valueRangeMax: selectedItem.valueRangeMax ?? 1,
      edgeSize: selectedItem.edgeSize ?? 1.0,
      nodeSize: selectedItem.nodeSize ?? 0.01, // Smaller default for antenna scale
      arrowSize: selectedItem.arrowSize ?? 0.01, // 10mm default
      arrowDensity: selectedItem.arrowDensity ?? 1,
      sizeFactor: selectedItem.sizeFactor ?? 0.5, // Default changed from 1.0 to 0.5
      lineStyle: selectedItem.lineStyle ?? 'solid',
      yAxisScale: selectedItem.yAxisScale ?? 'linear',
      scale: selectedItem.scale ?? 'logarithmic',
    };

    switch (selectedItem.type) {
      case 'antenna-system':
      case 'single-antenna':
        return (
          <>
            {/* Opacity Slider */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Picker */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Color
              </Typography>
              <input
                type="color"
                value={commonProps.color}
                onChange={(e) => handleItemPropertyChange('color', e.target.value)}
                style={{ width: '100%', height: 40, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}
              />
            </Box>
          </>
        );

      case 'current':
        return (
          <>
            {/* Display Quantity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Display Quantity
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.displayQuantity || 'magnitude'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('displayQuantity', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="magnitude">|I|</ToggleButton>
                <ToggleButton value="real">Re</ToggleButton>
                <ToggleButton value="imaginary">Im</ToggleButton>
                <ToggleButton value="phase">Phase</ToggleButton>
                <ToggleButton value="instantaneous">I(t)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Opacity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Map */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Color Map</InputLabel>
              <Select
                value={commonProps.colorMap}
                label="Color Map"
                onChange={(e) => handleItemPropertyChange('colorMap', e.target.value)}
              >
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="plasma">Plasma</MenuItem>
                <MenuItem value="twilight">Twilight</MenuItem>
              </Select>
            </FormControl>
            {renderColorbarToggle()}

            {/* Value Range */}
            <ValueRangeInput
              mode={commonProps.valueRangeMode}
              min={commonProps.valueRangeMin}
              max={commonProps.valueRangeMax}
              autoMin={autoRange.min}
              autoMax={autoRange.max}
              savedManualMin={selectedItem?.savedManualMin}
              savedManualMax={selectedItem?.savedManualMax}
              onModeChange={(v) => handleItemPropertyChange('valueRangeMode', v)}
              onMinChange={(v) => handleItemPropertyChange('valueRangeMin', v)}
              onMaxChange={(v) => handleItemPropertyChange('valueRangeMax', v)}
              onSaveManualRange={handleSaveManualRange}
            />

            {/* Edge Size */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Edge Size: {commonProps.edgeSize.toFixed(1)}
              </Typography>
              <Slider
                value={commonProps.edgeSize}
                onChange={(_, value) => handleItemPropertyChange('edgeSize', value as number)}
                min={1}
                max={10}
                step={0.5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>
          </>
        );

      case 'voltage':
        return (
          <>
            {/* Display Quantity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Display Quantity
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.displayQuantity || 'magnitude'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('displayQuantity', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="magnitude">|V|</ToggleButton>
                <ToggleButton value="real">Re</ToggleButton>
                <ToggleButton value="imaginary">Im</ToggleButton>
                <ToggleButton value="phase">Phase</ToggleButton>
                <ToggleButton value="instantaneous">V(t)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Opacity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Map */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Color Map</InputLabel>
              <Select
                value={commonProps.colorMap}
                label="Color Map"
                onChange={(e) => handleItemPropertyChange('colorMap', e.target.value)}
              >
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="plasma">Plasma</MenuItem>
                <MenuItem value="twilight">Twilight</MenuItem>
              </Select>
            </FormControl>
            {renderColorbarToggle()}

            {/* Value Range */}
            <ValueRangeInput
              mode={commonProps.valueRangeMode}
              min={commonProps.valueRangeMin}
              max={commonProps.valueRangeMax}
              autoMin={autoRange.min}
              autoMax={autoRange.max}
              savedManualMin={selectedItem?.savedManualMin}
              savedManualMax={selectedItem?.savedManualMax}
              onModeChange={(v) => handleItemPropertyChange('valueRangeMode', v)}
              onMinChange={(v) => handleItemPropertyChange('valueRangeMin', v)}
              onMaxChange={(v) => handleItemPropertyChange('valueRangeMax', v)}
              onSaveManualRange={handleSaveManualRange}
            />

            {/* Node Size */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Node Size: {commonProps.nodeSize.toFixed(3)} m
              </Typography>
              <Slider
                value={commonProps.nodeSize}
                onChange={(_, value) => handleItemPropertyChange('nodeSize', value as number)}
                min={0.001}
                max={0.05}
                step={0.001}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${(v * 1000).toFixed(1)} mm`}
                size="small"
              />
            </Box>
          </>
        );

      case 'field-magnitude':
      case 'field-magnitude-component':
        return (
          <>
            {/* Display Quantity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Display Quantity
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.displayQuantity || 'magnitude'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('displayQuantity', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="magnitude">|F|</ToggleButton>
                <ToggleButton value="real">Re</ToggleButton>
                <ToggleButton value="imaginary">Im</ToggleButton>
                <ToggleButton value="instantaneous">F(t)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Opacity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Map */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Color Map</InputLabel>
              <Select
                value={commonProps.colorMap}
                label="Color Map"
                onChange={(e) => handleItemPropertyChange('colorMap', e.target.value)}
              >
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="plasma">Plasma</MenuItem>
                <MenuItem value="twilight">Twilight</MenuItem>
              </Select>
            </FormControl>
            {renderColorbarToggle()}

            {/* Value Range */}
            <ValueRangeInput
              mode={commonProps.valueRangeMode}
              min={commonProps.valueRangeMin}
              max={commonProps.valueRangeMax}
              autoMin={autoRange.min}
              autoMax={autoRange.max}
              savedManualMin={selectedItem?.savedManualMin}
              savedManualMax={selectedItem?.savedManualMax}
              onModeChange={(v) => handleItemPropertyChange('valueRangeMode', v)}
              onMinChange={(v) => handleItemPropertyChange('valueRangeMin', v)}
              onMaxChange={(v) => handleItemPropertyChange('valueRangeMax', v)}
              onSaveManualRange={handleSaveManualRange}
            />

            {/* Smooth Shading */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedItem?.smoothShading ?? false}
                  onChange={(e) => handleItemPropertyChange('smoothShading', e.target.checked)}
                  size="small"
                />
              }
              label="Smooth Shading"
              sx={{ mb: 1 }}
            />

            {/* Interpolation Level */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Interpolation
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.interpolationLevel ?? 2}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('interpolationLevel', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value={1}>None</ToggleButton>
                <ToggleButton value={2}>2×</ToggleButton>
                <ToggleButton value={4}>4×</ToggleButton>
                <ToggleButton value={8}>8×</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Line Width (for 1D fields only) */}
            {(() => {
              const fieldDef = requestedFields?.find(f => f.id === selectedItem?.fieldId);
              if (fieldDef?.type === '1D') {
                return (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      Line Width: {(selectedItem?.lineWidth ?? 5).toFixed(1)} mm
                    </Typography>
                    <Slider
                      value={selectedItem?.lineWidth ?? 5}
                      onChange={(_, value) => handleItemPropertyChange('lineWidth', value as number)}
                      min={1}
                      max={20}
                      step={0.5}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v} mm`}
                      size="small"
                    />
                  </Box>
                );
              }
              return null;
            })()}
          </>
        );

      case 'directivity':
        return (
          <>
            {/* Opacity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Map */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Color Map</InputLabel>
              <Select
                value={commonProps.colorMap}
                label="Color Map"
                onChange={(e) => handleItemPropertyChange('colorMap', e.target.value)}
              >
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="plasma">Plasma</MenuItem>
                <MenuItem value="twilight">Twilight</MenuItem>
              </Select>
            </FormControl>
            {renderColorbarToggle()}

            {/* Scale Toggle (Linear/Logarithmic) */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Scale
              </Typography>
              <ToggleButtonGroup
                value={commonProps.scale}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('scale', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="linear">Linear</ToggleButton>
                <ToggleButton value="logarithmic">Log (dBi)</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Value Range */}
            <ValueRangeInput
              mode={commonProps.valueRangeMode}
              min={commonProps.valueRangeMin}
              max={commonProps.valueRangeMax}
              autoMin={autoRange.min}
              autoMax={autoRange.max}
              savedManualMin={selectedItem?.savedManualMin}
              savedManualMax={selectedItem?.savedManualMax}
              labelSuffix={commonProps.scale === 'logarithmic' ? '(dBi)' : ''}
              onModeChange={(v) => handleItemPropertyChange('valueRangeMode', v)}
              onMinChange={(v) => handleItemPropertyChange('valueRangeMin', v)}
              onMaxChange={(v) => handleItemPropertyChange('valueRangeMax', v)}
              onSaveManualRange={handleSaveManualRange}
            />

            {/* Size Factor */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Size Factor: {commonProps.sizeFactor.toFixed(1)}
              </Typography>
              <Slider
                value={commonProps.sizeFactor}
                onChange={(_, value) => handleItemPropertyChange('sizeFactor', value as number)}
                min={0.1}
                max={3}
                step={0.1}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>
          </>
        );

      case 'field-vector':
      case 'field-vector-component': {
        // Check if this is a Poynting vector (time-averaged — not animatable)
        const vectorFieldDef = requestedFields?.find(f => f.id === selectedItem?.fieldId);
        const isPoyntingVector = vectorFieldDef?.fieldType === 'poynting';

        return (
          <>
            {/* Display Quantity — unified toggle replacing vectorComplexPart + animationEnabled */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Display Quantity
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.displayQuantity || 'magnitude'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('displayQuantity', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="magnitude">|F|</ToggleButton>
                <ToggleButton value="real">Re</ToggleButton>
                <ToggleButton value="imaginary">Im</ToggleButton>
                {!isPoyntingVector && (
                  <ToggleButton value="instantaneous">F(t)</ToggleButton>
                )}
              </ToggleButtonGroup>
            </Box>

            {/* Opacity */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Opacity: {Math.round(commonProps.opacity * 100)}%
              </Typography>
              <Slider
                value={commonProps.opacity * 100}
                onChange={(_, value) => handleItemPropertyChange('opacity', (value as number) / 100)}
                min={0}
                max={100}
                step={5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>

            {/* Color Map */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Color Map</InputLabel>
              <Select
                value={commonProps.colorMap}
                label="Color Map"
                onChange={(e) => handleItemPropertyChange('colorMap', e.target.value)}
              >
                <MenuItem value="jet">Jet</MenuItem>
                <MenuItem value="turbo">Turbo</MenuItem>
                <MenuItem value="viridis">Viridis</MenuItem>
                <MenuItem value="plasma">Plasma</MenuItem>
                <MenuItem value="twilight">Twilight</MenuItem>
              </Select>
            </FormControl>
            {renderColorbarToggle()}

            {/* Value Range */}
            <ValueRangeInput
              mode={commonProps.valueRangeMode}
              min={commonProps.valueRangeMin}
              max={commonProps.valueRangeMax}
              autoMin={autoRange.min}
              autoMax={autoRange.max}
              savedManualMin={selectedItem?.savedManualMin}
              savedManualMax={selectedItem?.savedManualMax}
              onModeChange={(v) => handleItemPropertyChange('valueRangeMode', v)}
              onMinChange={(v) => handleItemPropertyChange('valueRangeMin', v)}
              onMaxChange={(v) => handleItemPropertyChange('valueRangeMax', v)}
              onSaveManualRange={handleSaveManualRange}
            />

            {/* Arrow Scaling Mode */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Arrow Scaling
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.arrowScalingMode || 'magnitude'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('arrowScalingMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="magnitude">Magnitude</ToggleButton>
                <ToggleButton value="uniform">Uniform</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Arrow Size (slider + textbox) */}
            <SliderWithInput
              value={commonProps.arrowSize}
              min={0.001}
              max={0.1}
              step={0.001}
              label="Arrow Size"
              formatValue={(v) => `${(v * 1000).toFixed(1)} mm`}
              formatSliderLabel={(v) => `${(v * 1000).toFixed(1)} mm`}
              scale={(x) => Math.pow(10, x)}
              onChange={(v) => handleItemPropertyChange('arrowSize', v)}
              inputWidth={70}
            />

            {/* Arrow Display Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Arrow Display
              </Typography>
              <ToggleButtonGroup
                value={selectedItem?.arrowDisplayMode || 'every-nth'}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('arrowDisplayMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="every-nth">Every Nth</ToggleButton>
                <ToggleButton value="random">Random N</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Arrow Density - shown when 'every-nth' mode */}
            {(!selectedItem?.arrowDisplayMode || selectedItem.arrowDisplayMode === 'every-nth') && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Arrow Density: every {commonProps.arrowDensity === 1 ? '' : commonProps.arrowDensity + getDensitySuffix(commonProps.arrowDensity) + ' '}arrow
                </Typography>
                <Slider
                  value={commonProps.arrowDensity}
                  onChange={(_, value) => handleItemPropertyChange('arrowDensity', value as number)}
                  min={1}
                  max={10}
                  step={1}
                  marks={[
                    { value: 1, label: 'All' },
                    { value: 5, label: '5th' },
                    { value: 10, label: '10th' },
                  ]}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>
            )}

            {/* Random Arrow Count - shown when 'random' mode */}
            {selectedItem?.arrowDisplayMode === 'random' && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Number of Arrows: {selectedItem?.randomArrowCount || 50}
                </Typography>
                <Slider
                  value={selectedItem?.randomArrowCount || 50}
                  onChange={(_, value) => handleItemPropertyChange('randomArrowCount', value as number)}
                  min={10}
                  max={500}
                  step={10}
                  marks={[
                    { value: 10, label: '10' },
                    { value: 100, label: '100' },
                    { value: 500, label: '500' },
                  ]}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>
            )}
          </>
        );
      }

      case 'scalar-plot':
        return (
          <>
            {/* Line Style */}
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Line Style</InputLabel>
              <Select
                value={commonProps.lineStyle}
                label="Line Style"
                onChange={(e) => handleItemPropertyChange('lineStyle', e.target.value)}
              >
                <MenuItem value="solid">Solid</MenuItem>
                <MenuItem value="dashed">Dashed</MenuItem>
                <MenuItem value="dotted">Dotted</MenuItem>
                <MenuItem value="dash-dot">Dash-Dot</MenuItem>
              </Select>
            </FormControl>

            {/* Color Picker */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Line Color
              </Typography>
              <input
                type="color"
                value={commonProps.color}
                onChange={(e) => handleItemPropertyChange('color', e.target.value)}
                style={{ width: '100%', height: 40, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4 }}
              />
            </Box>

            {/* Y-Axis Scale */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Y-Axis Scale
              </Typography>
              <RadioGroup
                value={commonProps.yAxisScale}
                onChange={(e) => handleItemPropertyChange('yAxisScale', e.target.value)}
              >
                <FormControlLabel value="linear" control={<Radio size="small" />} label="Linear" />
                <FormControlLabel value="log" control={<Radio size="small" />} label="Logarithmic" />
              </RadioGroup>
            </Box>
          </>
        );

      default:
        return (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            No additional properties for {selectedItem.type}
          </Typography>
        );
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        p: 2,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        boxSizing: 'border-box',
      }}
    >
      {/* View-Level Properties */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          View Properties
        </Typography>

        {/* View Name */}
        <TextField
          fullWidth
          label="Name"
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          onBlur={handleNameChange}
          size="small"
          sx={{ mb: 1.5 }}
        />

        {/* View Type Chip (read-only) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Type:
          </Typography>
          <Chip
            label={selectedView.viewType === '3D' ? '3D View' : 'Line View'}
            size="small"
            color={selectedView.viewType === '3D' ? 'primary' : 'secondary'}
          />
        </Box>

        {/* Frequency selection is now handled by the global FrequencySelector
           component in the PostprocessingTab left panel. */}

        {/* Delete View Button */}
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleDeleteClick}
          fullWidth
        >
          Delete View
        </Button>
      </Box>

      {/* Item-Specific Properties */}
      {selectedItem && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Item Properties
          </Typography>

          {/* Item Label */}
          <TextField
            fullWidth
            label="Label"
            value={itemLabel}
            onChange={(e) => setItemLabel(e.target.value)}
            onBlur={(e) => {
              const trimmed = e.target.value.trim();
              if (trimmed) {
                handleItemPropertyChange('label', trimmed);
              }
            }}
            size="small"
            sx={{ mb: 1.5 }}
          />

          {/* Visibility Checkbox */}
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedItem.visible}
                onChange={handleItemVisibilityToggle}
              />
            }
            label="Visible"
            sx={{ mb: 1.5 }}
          />

          {/* Type-Specific Property Editors */}
          {renderItemTypeProperties()}
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>Delete View?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete &quot;{selectedView.name}&quot;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PostprocessingPropertiesPanel;
