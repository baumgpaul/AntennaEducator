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
import { formatValue } from '@/utils/expressionEvaluator';
import type { AntennaElement, Source, ComplexNumber } from '@/types/models';

// Helper to convert comma to period in number inputs
const handleDecimalInput = (e: React.FormEvent<HTMLDivElement>) => {
  const input = e.target as HTMLInputElement;
  if (input.value.includes(',')) {
    input.value = input.value.replace(',', '.');
  }
};

/** Render a geometry property row, showing expression if stored. */
function GeometryRow({
  label,
  value,
  unit,
  exprKey,
  expressions,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  exprKey: string;
  expressions?: Record<string, string>;
}) {
  const expr = expressions?.[exprKey];
  const hasExpr = expr !== undefined && expr !== String(value);
  const displayVal = value != null ? (typeof value === 'number' ? formatValue(value) : String(value)) : '—';

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">{label}:</Typography>
        <Typography variant="body2">{displayVal}{unit ? ` ${unit}` : ''}</Typography>
      </Box>
      {hasExpr && (
        <Typography variant="caption" fontFamily="monospace" color="primary.main" sx={{ pl: 1 }}>
          = {expr}
        </Typography>
      )}
    </Box>
  );
}

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
  onSourceChange?: (elementId: string, source: Source) => void;
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
  // Config can be in flat format (DipoleConfig) or nested backend format (with .parameters)
  const params = cfg.parameters || cfg;
  switch (element.type) {
    case 'dipole':
      return params.orientation ? toArray3(params.orientation) : [0, 0, 1];
    case 'loop':
      return params.normal_vector ? toArray3(params.normal_vector) : [0, 0, 1];
    case 'helix':
      return params.axis_direction ? toArray3(params.axis_direction) : [0, 0, 1];
    case 'rod':
      return params.direction ? toArray3(params.direction) : [0, 0, 1];
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
  onSourceChange,
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

  // --- Source configuration state ---
  const primarySource = antennaElement?.sources?.[0];

  function extractSourceAmplitudePhase(source?: Source): { magnitude: number; phaseDeg: number } {
    if (!source) return { magnitude: 1, phaseDeg: 0 };
    const amp = source.amplitude;
    if (amp !== undefined && amp !== null && typeof amp === 'object' && 'real' in amp && 'imag' in amp) {
      const c = amp as ComplexNumber;
      const magnitude = Math.sqrt(c.real * c.real + c.imag * c.imag);
      const phaseDeg = Math.atan2(c.imag, c.real) * (180 / Math.PI);
      return { magnitude, phaseDeg: Math.round(phaseDeg * 1000) / 1000 };
    }
    if (typeof amp === 'number') return { magnitude: Math.abs(amp), phaseDeg: 0 };
    return { magnitude: 1, phaseDeg: 0 };
  }

  const { magnitude: initMag, phaseDeg: initPhase } = extractSourceAmplitudePhase(primarySource);
  const [localSourceType, setLocalSourceType] = useState<'voltage' | 'current'>(primarySource?.type || 'voltage');
  const [localAmplitude, setLocalAmplitude] = useState(initMag);
  const [localPhase, setLocalPhase] = useState(initPhase);

  // Sync local source state when element changes
  useEffect(() => {
    if (antennaElement?.sources?.[0]) {
      const src = antennaElement.sources[0];
      const { magnitude, phaseDeg } = extractSourceAmplitudePhase(src);
      setLocalSourceType(src.type || 'voltage');
      setLocalAmplitude(magnitude);
      setLocalPhase(phaseDeg);
    }
  }, [antennaElement?.id, antennaElement?.sources]);

  const emitSourceChange = (type: 'voltage' | 'current', amplitude: number, phaseDeg: number) => {
    if (!antennaElement || !onSourceChange || !primarySource) return;
    const phaseRad = (phaseDeg * Math.PI) / 180;
    const updatedSource: Source = {
      ...primarySource,
      type,
      amplitude: {
        real: amplitude * Math.cos(phaseRad),
        imag: amplitude * Math.sin(phaseRad),
      },
    };
    onSourceChange(antennaElement.id, updatedSource);
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

                {/* Type-Specific Parameters (read-only) */}
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Geometry Parameters
                  </Typography>
                  <Stack spacing={1}>
                    {antennaElement.type === 'dipole' && (
                      <>
                        <GeometryRow label="Length" value={(antennaElement.config as any).length} unit="m" exprKey="length" expressions={antennaElement.expressions} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Segments:</Typography>
                          <Typography variant="body2">{(antennaElement.config as any).segments ?? '—'}</Typography>
                        </Box>
                        <GeometryRow label="Wire radius" value={(antennaElement.config as any).wire_radius} unit="m" exprKey="radius" expressions={antennaElement.expressions} />
                        <GeometryRow label="Feed gap" value={(antennaElement.config as any).gap} unit="m" exprKey="gap" expressions={antennaElement.expressions} />
                      </>
                    )}
                    {antennaElement.type === 'loop' && (
                      <>
                        <GeometryRow label="Radius" value={(antennaElement.config as any).radius} unit="m" exprKey="radius" expressions={antennaElement.expressions} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Segments:</Typography>
                          <Typography variant="body2">{(antennaElement.config as any).segments ?? '—'}</Typography>
                        </Box>
                        <GeometryRow label="Wire radius" value={(antennaElement.config as any).wire_radius} unit="m" exprKey="wireRadius" expressions={antennaElement.expressions} />
                        <GeometryRow label="Feed gap" value={(antennaElement.config as any).gap} unit="m" exprKey="feedGap" expressions={antennaElement.expressions} />
                      </>
                    )}
                    {antennaElement.type === 'helix' && (
                      <>
                        <GeometryRow label="Diameter" value={(antennaElement.config as any).radius ? (antennaElement.config as any).radius * 2 : null} unit="m" exprKey="diameter" expressions={antennaElement.expressions} />
                        <GeometryRow label="Pitch" value={(antennaElement.config as any).pitch} unit="m" exprKey="pitch" expressions={antennaElement.expressions} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Turns:</Typography>
                          <Typography variant="body2">{(antennaElement.config as any).turns ?? '—'}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Segments/turn:</Typography>
                          <Typography variant="body2">{(antennaElement.config as any).segments_per_turn ?? '—'}</Typography>
                        </Box>
                        <GeometryRow label="Wire radius" value={(antennaElement.config as any).wire_radius} unit="m" exprKey="wire_radius" expressions={antennaElement.expressions} />
                      </>
                    )}
                    {antennaElement.type === 'rod' && (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Length:</Typography>
                          <Typography variant="body2">{((antennaElement.config as any).length ?? '—')} m</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Segments:</Typography>
                          <Typography variant="body2">{(antennaElement.config as any).segments ?? '—'}</Typography>
                        </Box>
                        <GeometryRow label="Wire radius" value={(antennaElement.config as any).wire_radius} unit="m" exprKey="radius" expressions={antennaElement.expressions} />
                      </>
                    )}
                    {/* Mesh info (always shown) */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Nodes:</Typography>
                      <Typography variant="body2">{antennaElement.mesh?.nodes?.length ?? 0}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Edges:</Typography>
                      <Typography variant="body2">{antennaElement.mesh?.edges?.length ?? 0}</Typography>
                    </Box>
                  </Stack>
                </Box>

                {/* Feed Configuration (for elements with sources) */}
                {primarySource && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                        Feed Configuration
                      </Typography>
                      <ToggleButtonGroup
                        value={localSourceType}
                        exclusive
                        onChange={(_, value) => {
                          if (value !== null) {
                            setLocalSourceType(value);
                            emitSourceChange(value, localAmplitude, localPhase);
                          }
                        }}
                        size="small"
                        sx={{ mb: 2, display: 'flex' }}
                      >
                        <ToggleButton value="voltage" sx={{ flex: 1 }}>Voltage</ToggleButton>
                        <ToggleButton value="current" sx={{ flex: 1 }}>Current</ToggleButton>
                      </ToggleButtonGroup>
                      <Stack spacing={1}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Amplitude"
                          type="number"
                          value={localAmplitude}
                          onInput={handleDecimalInput}
                          onChange={(e) => {
                            const val = parseDecimalNumber(e.target.value) ?? 0;
                            setLocalAmplitude(val);
                            emitSourceChange(localSourceType, val, localPhase);
                          }}
                          sx={{ bgcolor: 'background.default' }}
                          InputProps={{
                            endAdornment: (
                              <Typography variant="caption">
                                {localSourceType === 'voltage' ? 'V' : 'A'}
                              </Typography>
                            ),
                          }}
                          inputProps={{ step: 0.1, min: 0 }}
                        />
                        <TextField
                          fullWidth
                          size="small"
                          label="Phase"
                          type="number"
                          value={localPhase}
                          onInput={handleDecimalInput}
                          onChange={(e) => {
                            const val = parseDecimalNumber(e.target.value) ?? 0;
                            setLocalPhase(val);
                            emitSourceChange(localSourceType, localAmplitude, val);
                          }}
                          sx={{ bgcolor: 'background.default' }}
                          InputProps={{
                            endAdornment: <Typography variant="caption">°</Typography>,
                          }}
                          inputProps={{ step: 1 }}
                        />
                      </Stack>
                    </Box>
                  </>
                )}
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
