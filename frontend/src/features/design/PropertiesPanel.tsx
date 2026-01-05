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
  onRotationChange
}: PropertiesPanelProps) {
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

                {/* Rotation */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Rotation
                  </Typography>
                  <Stack spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      label="X"
                      type="number"
                      value={(antennaElement.rotation[0] * 180 / Math.PI).toFixed(1)}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onRotationChange) {
                          const degToRad = parseFloat(e.target.value) * Math.PI / 180;
                          const newRot: [number, number, number] = [
                            degToRad,
                            antennaElement.rotation[1],
                            antennaElement.rotation[2]
                          ];
                          onRotationChange(antennaElement.id, newRot);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">°</Typography>,
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Y"
                      type="number"
                      value={(antennaElement.rotation[1] * 180 / Math.PI).toFixed(1)}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onRotationChange) {
                          const degToRad = parseFloat(e.target.value) * Math.PI / 180;
                          const newRot: [number, number, number] = [
                            antennaElement.rotation[0],
                            degToRad,
                            antennaElement.rotation[2]
                          ];
                          onRotationChange(antennaElement.id, newRot);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">°</Typography>,
                      }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      label="Z"
                      type="number"
                      value={(antennaElement.rotation[2] * 180 / Math.PI).toFixed(1)}
                      onInput={handleDecimalInput}
                      onChange={(e) => {
                        if (onRotationChange) {
                          const degToRad = parseFloat(e.target.value) * Math.PI / 180;
                          const newRot: [number, number, number] = [
                            antennaElement.rotation[0],
                            antennaElement.rotation[1],
                            degToRad
                          ];
                          onRotationChange(antennaElement.id, newRot);
                        }
                      }}
                      sx={{ bgcolor: 'background.default' }}
                      InputProps={{
                        endAdornment: <Typography variant="caption">°</Typography>,
                      }}
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
