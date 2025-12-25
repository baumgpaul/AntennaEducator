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
}

/**
 * PropertiesPanel - Displays and edits properties of selected elements
 * Shows geometry, material, source, and load parameters
 */
function PropertiesPanel({ selectedElement, onPropertyChange }: PropertiesPanelProps) {
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
          Properties
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {selectedElement ? 'Element properties' : 'No element selected'}
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {!selectedElement ? (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: 'center',
              bgcolor: 'background.default',
              borderStyle: 'dashed',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select an element in the 3D view or tree to view its properties
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={2}>
            {/* Element Info */}
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

            {/* Additional Info Section */}
            {selectedElement.type === 'edge' && (
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

            {selectedElement.type === 'source' && (
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
