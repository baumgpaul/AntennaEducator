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
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectSelectedView,
  selectSelectedItem,
  renameViewConfiguration,
  deleteViewConfiguration,
  updateItemProperty,
  toggleItemVisibility,
  setViewFrequency,
} from '../../store/postprocessingSlice';

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
          width: 300,
          height: '100%',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
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
  const hasMultipleFrequencies = computedFrequenciesMHz.length > 1;
  const hasAnyFrequencies = computedFrequenciesMHz.length > 0;

  // Get current frequency, defaulting to first computed frequency if not set
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

  const handleFrequencyChange = (_event: Event, value: number | number[]) => {
    const frequencyMHz = value as number;
    const frequencyHz = frequencyMHz * 1e6;
    dispatch(setViewFrequency({ viewId: selectedView.id, frequencyHz }));
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

    const commonProps = {
      opacity: selectedItem.opacity ?? 0.8,
      color: selectedItem.color ?? '#FF8C00',
      colorMap: selectedItem.colorMap ?? 'jet',
      showColorbar: selectedItem.showColorbar !== false,
      valueRangeMode: selectedItem.valueRangeMode ?? 'auto',
      valueRangeMin: selectedItem.valueRangeMin ?? 0,
      valueRangeMax: selectedItem.valueRangeMax ?? 1,
      edgeSize: selectedItem.edgeSize ?? 1.0,
      nodeSize: selectedItem.nodeSize ?? 1.0,
      arrowSize: selectedItem.arrowSize ?? 1.0,
      sizeFactor: selectedItem.sizeFactor ?? 1.0,
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

            {/* Value Range Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Value Range
              </Typography>
              <ToggleButtonGroup
                value={commonProps.valueRangeMode}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('valueRangeMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                <ToggleButton value="manual">Manual</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Manual Range Inputs */}
            {commonProps.valueRangeMode === 'manual' && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={commonProps.valueRangeMin}
                  onChange={(e) => handleItemPropertyChange('valueRangeMin', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Max"
                  type="number"
                  value={commonProps.valueRangeMax}
                  onChange={(e) => handleItemPropertyChange('valueRangeMax', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
              </Box>
            )}

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

            {/* Value Range Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Value Range
              </Typography>
              <ToggleButtonGroup
                value={commonProps.valueRangeMode}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('valueRangeMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                <ToggleButton value="manual">Manual</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Manual Range Inputs */}
            {commonProps.valueRangeMode === 'manual' && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={commonProps.valueRangeMin}
                  onChange={(e) => handleItemPropertyChange('valueRangeMin', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Max"
                  type="number"
                  value={commonProps.valueRangeMax}
                  onChange={(e) => handleItemPropertyChange('valueRangeMax', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
              </Box>
            )}

            {/* Node Size */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Node Size: {commonProps.nodeSize.toFixed(1)}
              </Typography>
              <Slider
                value={commonProps.nodeSize}
                onChange={(_, value) => handleItemPropertyChange('nodeSize', value as number)}
                min={0.01}
                max={0.05}
                step={0.01}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>
          </>
        );

      case 'field-magnitude':
      case 'field-magnitude-component':
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

            {/* Value Range Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Value Range
              </Typography>
              <ToggleButtonGroup
                value={commonProps.valueRangeMode}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('valueRangeMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                <ToggleButton value="manual">Manual</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Manual Range Inputs */}
            {commonProps.valueRangeMode === 'manual' && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={commonProps.valueRangeMin}
                  onChange={(e) => handleItemPropertyChange('valueRangeMin', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Max"
                  type="number"
                  value={commonProps.valueRangeMax}
                  onChange={(e) => handleItemPropertyChange('valueRangeMax', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
              </Box>
            )}
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

            {/* Value Range Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Value Range {commonProps.scale === 'logarithmic' ? '(dBi)' : ''}
              </Typography>
              <ToggleButtonGroup
                value={commonProps.valueRangeMode}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('valueRangeMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                <ToggleButton value="manual">Manual</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Manual Range Inputs */}
            {commonProps.valueRangeMode === 'manual' && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label={`Min${commonProps.scale === 'logarithmic' ? ' (dBi)' : ''}`}
                  type="number"
                  value={commonProps.valueRangeMin}
                  onChange={(e) => handleItemPropertyChange('valueRangeMin', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
                <TextField
                  label={`Max${commonProps.scale === 'logarithmic' ? ' (dBi)' : ''}`}
                  type="number"
                  value={commonProps.valueRangeMax}
                  onChange={(e) => handleItemPropertyChange('valueRangeMax', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
              </Box>
            )}

            {/* Size Factor */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Size Factor: {commonProps.sizeFactor.toFixed(1)}
              </Typography>
              <Slider
                value={commonProps.sizeFactor}
                onChange={(_, value) => handleItemPropertyChange('sizeFactor', value as number)}
                min={0.1}
                max={10}
                step={0.1}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>
          </>
        );

      case 'field-vector':
      case 'field-vector-component':
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

            {/* Value Range Mode Toggle */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Value Range
              </Typography>
              <ToggleButtonGroup
                value={commonProps.valueRangeMode}
                exclusive
                onChange={(_, value) => value && handleItemPropertyChange('valueRangeMode', value)}
                size="small"
                fullWidth
              >
                <ToggleButton value="auto">Auto</ToggleButton>
                <ToggleButton value="manual">Manual</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Manual Range Inputs */}
            {commonProps.valueRangeMode === 'manual' && (
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  label="Min"
                  type="number"
                  value={commonProps.valueRangeMin}
                  onChange={(e) => handleItemPropertyChange('valueRangeMin', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Max"
                  type="number"
                  value={commonProps.valueRangeMax}
                  onChange={(e) => handleItemPropertyChange('valueRangeMax', parseFloat(e.target.value))}
                  size="small"
                  fullWidth
                />
              </Box>
            )}

            {/* Arrow Size */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Arrow Size: {commonProps.arrowSize.toFixed(1)}
              </Typography>
              <Slider
                value={commonProps.arrowSize}
                onChange={(_, value) => handleItemPropertyChange('arrowSize', value as number)}
                min={1}
                max={10}
                step={0.5}
                valueLabelDisplay="auto"
                size="small"
              />
            </Box>
          </>
        );

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
        width: 300,
        height: '100%',
        p: 2,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
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

        {/* Frequency Slider (3D views with multiple frequencies only) */}
        {selectedView.viewType === '3D' && hasMultipleFrequencies && hasAnyFrequencies && currentFrequencyMHz !== null && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="body2" gutterBottom>
              Frequency: {currentFrequencyMHz.toFixed(2)} MHz
            </Typography>
            <Slider
              value={currentFrequencyMHz}
              onChange={handleFrequencyChange}
              min={Math.min(...computedFrequenciesMHz)}
              max={Math.max(...computedFrequenciesMHz)}
              step={null}
              marks={computedFrequenciesMHz.map((freq) => ({ value: freq, label: '' }))}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value.toFixed(2)} MHz`}
            />
          </Box>
        )}

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
