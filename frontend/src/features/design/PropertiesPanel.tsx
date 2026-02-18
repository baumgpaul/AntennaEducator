import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { MuiColorInput } from 'mui-color-input';
import { parseDecimalNumber } from '@/utils/numberParser';
import type { AntennaElement } from '@/types/models';

// Helper to convert comma to period in number inputs
const handleDecimalInput = (e: React.FormEvent<HTMLDivElement>) => {
  const input = e.target as HTMLInputElement;
  if (input.value.includes(',')) {
    input.value = input.value.replace(',', '.');
  }
};

interface PropertyField {
  label: string;
  value: string | number;
  type: 'text' | 'number' | 'select';
  options?: string[];
  unit?: string;
  editable?: boolean;
}

interface PropertiesPanelProps {
  selectedElement?: {
    id: string;
    type: 'mesh' | 'edge' | 'node' | 'source' | 'load';
    properties: Record<string, PropertyField>;
  } | null;
  onPropertyChange?: (key: string, value: string | number) => void;
  // New: Support for AntennaElement editing
  antennaElement?: AntennaElement | null;
  onColorChange?: (elementId: string, color: string) => void;
  onPositionChange?: (elementId: string, position: [number, number, number]) => void;
  onRotationChange?: (elementId: string, rotation: [number, number, number]) => void;
  onOrientationChange?: (elementId: string, orientation: [number, number, number]) => void;
}

/**
 * Get the orientation vector from an antenna element's config.
 * Each element type stores it under a different key.
 * Handles both array [x,y,z] and object {x,y,z} formats from backend.
 */
function toArray3(v: any): [number, number, number] {
  if (Array.isArray(v)) return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
  if (v && typeof v === 'object') return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
  return [0, 0, 1];
}

function getElementOrientation(element: AntennaElement): [number, number, number] {
  const cfg = element.config as any;
  switch (element.type) {
    case 'dipole':
      return cfg.orientation ? toArray3(cfg.orientation) : [0, 0, 1];
    case 'loop':
      return cfg.normal_vector ? toArray3(cfg.normal_vector) : [0, 0, 1];
    case 'helix':
      return cfg.axis_direction ? toArray3(cfg.axis_direction) : [0, 0, 1];
    case 'rod':
      return cfg.direction ? toArray3(cfg.direction) : [0, 0, 1];
    default:
      return [0, 0, 1];
  }
}

/**
 * Get the label for the orientation vector based on element type.
 */
function getOrientationLabel(type: string): string {
  switch (type) {
    case 'dipole': return 'Orientation Vector';
    case 'loop': return 'Normal Vector';
    case 'helix': return 'Axis Direction';
    case 'rod': return 'Direction';
    default: return 'Orientation';
  }
}

/**
 * Determine which axis preset is active for an orientation vector.
 */
function getActivePreset(orientation: [number, number, number]): 'X' | 'Y' | 'Z' | 'Custom' {
  const [x, y, z] = orientation;
  if (x === 1 && y === 0 && z === 0) return 'X';
  if (x === 0 && y === 1 && z === 0) return 'Y';
  if (x === 0 && y === 0 && z === 1) return 'Z';
  return 'Custom';
}

/**
 * PropertiesPanel - Displays and edits properties of selected elements
 * Shows geometry, material, source, and load parameters
 */
function PropertiesPanel({
  selectedElement,
  onPropertyChange,
  antennaElement,
  onColorChange,
  onPositionChange,
  onRotationChange,
  onOrientationChange,
}: PropertiesPanelProps) {
  // Track orientation locally for responsive UI
  const elementOrientation = antennaElement ? getElementOrientation(antennaElement) : [0, 0, 1] as [number, number, number];
  const [localOrientation, setLocalOrientation] = useState<[number, number, number]>(elementOrientation as [number, number, number]);

  // Sync local orientation when element changes
  useEffect(() => {
    if (antennaElement) {
      setLocalOrientation(getElementOrientation(antennaElement));
    }
  }, [antennaElement?.id, antennaElement?.config]);

  const handlePresetChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    if (!antennaElement || !onOrientationChange) return;
    let newOrientation: [number, number, number];
    if (value === 'X') {
      newOrientation = [1, 0, 0];
    } else if (value === 'Y') {
      newOrientation = [0, 1, 0];
    } else if (value === 'Z') {
      newOrientation = [0, 0, 1];
    } else {
      return; // Custom doesn't change values
    }
    setLocalOrientation(newOrientation);
    onOrientationChange(antennaElement.id, newOrientation);
  };

  const handleOrientationComponentChange = (index: number, value: number) => {
    if (!antennaElement || !onOrientationChange) return;
    const newOrientation: [number, number, number] = [...localOrientation] as [number, number, number];
    newOrientation[index] = value;
    setLocalOrientation(newOrientation);
    onOrientationChange(antennaElement.id, newOrientation);
  };
  const renderPropertyField = (key: string, field: PropertyField) => {
    const handleChange = (value: string | number) => {
      if (field.editable !== false) {
        onPropertyChange?.(key, value);
      }
    };

    switch (field.type) {
      case 'select':
        return (
          <FormControl fullWidth size="small" key={key}>
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={field.value}
              label={field.label}
              onChange={(e) => handleChange(e.target.value)}
              disabled={field.editable === false}
            >
              {field.options?.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 'number':
        return (
          <TextField
            key={key}
            fullWidth
            size="small"
            label={field.label}
            type="number"
            value={field.value}
            onChange={(e) => handleChange(parseFloat(e.target.value))}
            disabled={field.editable === false}
            InputProps={{
              endAdornment: field.unit ? (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {field.unit}
                </Typography>
              ) : undefined,
            }}
          />
        );

      default:
        return (
          <TextField
            key={key}
            fullWidth
            size="small"
            label={field.label}
            value={field.value}
            onChange={(e) => handleChange(e.target.value)}
            disabled={field.editable === false}
          />
        );
    }
  };

  // Mock properties for demonstration - will be replaced with real data
  const mockProperties: Record<string, PropertyField> = selectedElement
    ? selectedElement.properties
    : {};

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'mesh':
        return 'Antenna Mesh';
      case 'edge':
        return 'Wire Segment';
      case 'node':
        return 'Node';
      case 'source':
        return 'Excitation Source';
      case 'load':
        return 'Lumped Element';
      default:
        return 'Element';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'mesh':
        return 'primary';
      case 'edge':
        return 'info';
      case 'node':
        return 'success';
      case 'source':
        return 'error';
      case 'load':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <Box
      key={antennaElement?.id || selectedElement?.id || 'no-selection'}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.primary' }}>
          Properties
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {antennaElement ? antennaElement.name : selectedElement ? 'Element properties' : 'No element selected'}
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: 'background.paper' }}>
        {!selectedElement && !antennaElement ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              bgcolor: 'background.paper',
              borderStyle: 'dashed',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select an element in the 3D view or tree to view its properties
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {/* Antenna Element Properties */}
            {antennaElement && (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Element Type
                  </Typography>
                  <Chip
                    label={antennaElement.type.charAt(0).toUpperCase() + antennaElement.type.slice(1)}
                    color="primary"
                    size="small"
                  />
                </Box>

                <Divider />

                {/* Element Name */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Name
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={antennaElement.name}
                    disabled
                    sx={{ bgcolor: 'background.default' }}
                  />
                </Box>

                {/* Element Color */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Element Color
                  </Typography>
                  <MuiColorInput
                    value={antennaElement.color || '#FF8C00'}
                    onChange={(newColor) => {
                      if (onColorChange) {
                        onColorChange(antennaElement.id, newColor);
                      }
                    }}
                    format="hex"
                    size="small"
                    fullWidth
                  />
                </Box>

                {/* Position */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Position
                  </Typography>
                  <Stack spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      label="X"
                      type="number"
                      value={antennaElement.position[0]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onPositionChange) {
                          const newPos: [number, number, number] = [
                            parseFloat(e.target.value) || 0,
                            antennaElement.position[1],
                            antennaElement.position[2]
                          ];
                          onPositionChange(antennaElement.id, newPos);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">m</Typography>,
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Y"
                      type="number"
                      value={antennaElement.position[1]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onPositionChange) {
                          const newPos: [number, number, number] = [
                            antennaElement.position[0],
                            parseFloat(e.target.value) || 0,
                            antennaElement.position[2]
                          ];
                          onPositionChange(antennaElement.id, newPos);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">m</Typography>,
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Z"
                      type="number"
                      value={antennaElement.position[2]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onPositionChange) {
                          const newPos: [number, number, number] = [
                            antennaElement.position[0],
                            antennaElement.position[1],
                            parseFloat(e.target.value) || 0
                          ];
                          onPositionChange(antennaElement.id, newPos);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">m</Typography>,
                      }}
                    />
                  </Stack>
                </Box>

                {/* Orientation Vector (replaces rotation for all antenna element types) */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    {getOrientationLabel(antennaElement.type)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontSize: '0.7rem' }}>
                    Direction the {antennaElement.type} points along (will be normalized)
                  </Typography>
                  <ToggleButtonGroup
                    value={getActivePreset(localOrientation)}
                    exclusive
                    onChange={handlePresetChange}
                    size="small"
                    sx={{ mb: 1, display: 'flex' }}
                  >
                    <ToggleButton value="X" sx={{ flex: 1 }}>X-axis</ToggleButton>
                    <ToggleButton value="Y" sx={{ flex: 1 }}>Y-axis</ToggleButton>
                    <ToggleButton value="Z" sx={{ flex: 1 }}>Z-axis</ToggleButton>
                    <ToggleButton value="Custom" sx={{ flex: 1 }}>Custom</ToggleButton>
                  </ToggleButtonGroup>
                  <Stack spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      label="X"
                      type="number"
                      value={localOrientation[0]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        handleOrientationComponentChange(0, parseDecimalNumber(e.target.value) || 0);
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      inputProps={{ step: 0.1 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Y"
                      type="number"
                      value={localOrientation[1]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        handleOrientationComponentChange(1, parseDecimalNumber(e.target.value) || 0);
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      inputProps={{ step: 0.1 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Z"
                      type="number"
                      value={localOrientation[2]}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        handleOrientationComponentChange(2, parseDecimalNumber(e.target.value) || 0);
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      inputProps={{ step: 0.1 }}
                    />
                  </Stack>
                </Box>

                {/* Mesh Info */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Mesh Statistics
                  </Typography>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Nodes:
                      </Typography>
                      <Typography variant="body2">{antennaElement.mesh.nodes.length}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Edges:
                      </Typography>
                      <Typography variant="body2">{antennaElement.mesh.edges.length}</Typography>
                    </Box>
                  </Stack>
                </Box>
              </>
            )}

            {/* Legacy Element Info */}
            {selectedElement && !antennaElement && (
              <>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Element Type
                  </Typography>
                  <Chip
                    label={getTypeLabel(selectedElement.type)}
                    color={getTypeColor(selectedElement.type) as any}
                    size="small"
                  />
                </Box>

                    <Divider />

                {/* Properties */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Parameters
                  </Typography>
                  <Stack spacing={2}>
                    {Object.entries(mockProperties).map(([key, field]) => renderPropertyField(key, field))}
                  </Stack>
                </Box>
              </>
            )}

            {/* Additional Info Section */}
            {selectedElement && selectedElement.type === 'edge' && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Computed Values
                  </Typography>
                  <Stack spacing={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Length:
                      </Typography>
                      <Typography variant="body2">1.234 m</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Resistance:
                      </Typography>
                      <Typography variant="body2">0.052 Ω</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">
                        Inductance:
                      </Typography>
                      <Typography variant="body2">12.5 nH</Typography>
                    </Box>
                  </Stack>
                </Box>
              </>
            )}

            {selectedElement && selectedElement.type === 'source' && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Source Parameters
                  </Typography>
                  <Stack spacing={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Magnitude"
                      type="number"
                      defaultValue={1.0}
                      InputProps={{
                        endAdornment: <Typography variant="caption">V</Typography>,
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Phase"
                      type="number"
                      defaultValue={0}
                      InputProps={{
                        endAdornment: <Typography variant="caption">°</Typography>,
                      }}
                    />
                  </Stack>
                </Box>
              </>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

export default PropertiesPanel;
