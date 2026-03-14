/**
 * ProbePickerDialog — Choose and configure an FDTD field probe.
 *
 * Enabled probe types: point, line, plane.
 * Disabled (coming with 3D): near-field contour.
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  GpsFixed as PointIcon,
  LinearScale as LineIcon,
  CropSquare as PlaneIcon,
  Radar as NearFieldIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addProbe } from '@/store/fdtdDesignSlice';
import type { FdtdProbeType, FieldComponent } from '@/types/fdtd';

interface ProbePickerDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ProbeOption {
  type: FdtdProbeType | 'near_field';
  label: string;
  description: string;
  icon: React.ReactElement;
  disabled?: boolean;
  disabledReason?: string;
}

const PROBE_OPTIONS: ProbeOption[] = [
  {
    type: 'point',
    label: 'Point Probe',
    description: 'Record field at a single point over time',
    icon: <PointIcon />,
  },
  {
    type: 'line',
    label: 'Line Probe',
    description: 'Record field along a line segment',
    icon: <LineIcon />,
  },
  {
    type: 'plane',
    label: 'Plane Probe',
    description: 'Record field over a rectangular plane',
    icon: <PlaneIcon />,
  },
  {
    type: 'near_field',
    label: 'Near-Field Contour',
    description: 'Near-field to far-field transformation surface',
    icon: <NearFieldIcon />,
    disabled: true,
    disabledReason: 'Coming with 3D',
  },
];

const FIELD_COMPONENTS: FieldComponent[] = ['Ex', 'Ey', 'Ez', 'Hx', 'Hy', 'Hz'];

function ProbePickerDialog({ open, onClose }: ProbePickerDialogProps) {
  const dispatch = useAppDispatch();
  const design = useAppSelector((s) => s.fdtdDesign);

  const [selectedType, setSelectedType] = useState<FdtdProbeType | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FieldComponent[]>(['Ez']);

  // Line probe
  const [lineDirX, setLineDirX] = useState(1);
  const [lineDirY, setLineDirY] = useState(0);
  const [lineDirZ, setLineDirZ] = useState(0);

  // Plane probe
  const [planeExtentX, setPlaneExtentX] = useState(0.1);
  const [planeExtentY, setPlaneExtentY] = useState(0.1);

  const handleToggleField = (_: unknown, newFields: FieldComponent[]) => {
    if (newFields.length > 0) setFields(newFields);
  };

  const handleAdd = () => {
    if (!selectedType) return;

    const pos: [number, number, number] =
      design.dimensionality === '1d'
        ? [design.domainSize[0] * 0.75, 0, 0]
        : [design.domainSize[0] * 0.75, design.domainSize[1] * 0.75, 0];

    const probeName = name.trim() || `Probe ${design.probes.length + 1}`;

    dispatch(
      addProbe({
        name: probeName,
        type: selectedType,
        position: pos,
        fields,
        ...(selectedType === 'line'
          ? { direction: [lineDirX, lineDirY, lineDirZ] as [number, number, number] }
          : {}),
        ...(selectedType === 'plane'
          ? { extent: [planeExtentX, planeExtentY] as [number, number] }
          : {}),
      }),
    );

    setSelectedType(null);
    setName('');
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Probe</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle2">Probe Type</Typography>
          <List dense disablePadding>
            {PROBE_OPTIONS.map((opt) => (
              <ListItemButton
                key={opt.type}
                selected={selectedType === opt.type}
                disabled={opt.disabled}
                onClick={() => {
                  if (opt.type !== 'near_field') setSelectedType(opt.type as FdtdProbeType);
                }}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{opt.icon}</ListItemIcon>
                <ListItemText primary={opt.label} secondary={opt.description} />
                {opt.disabled && (
                  <Chip label={opt.disabledReason} size="small" variant="outlined" />
                )}
              </ListItemButton>
            ))}
          </List>

          {selectedType && (
            <>
              <Divider />
              <Typography variant="subtitle2">Configuration</Typography>

              <TextField
                fullWidth
                label="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Probe ${design.probes.length + 1}`}
              />

              <Typography variant="caption" color="text.secondary">
                Field Components
              </Typography>
              <ToggleButtonGroup
                value={fields}
                onChange={handleToggleField}
                size="small"
              >
                {FIELD_COMPONENTS.map((fc) => (
                  <ToggleButton key={fc} value={fc}>
                    {fc}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {selectedType === 'line' && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Direction Vector
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="dir X"
                      type="number"
                      size="small"
                      value={lineDirX}
                      onChange={(e) => setLineDirX(+e.target.value)}
                      inputProps={{ step: 0.1 }}
                    />
                    <TextField
                      label="dir Y"
                      type="number"
                      size="small"
                      value={lineDirY}
                      onChange={(e) => setLineDirY(+e.target.value)}
                      inputProps={{ step: 0.1 }}
                    />
                    <TextField
                      label="dir Z"
                      type="number"
                      size="small"
                      value={lineDirZ}
                      onChange={(e) => setLineDirZ(+e.target.value)}
                      inputProps={{ step: 0.1 }}
                    />
                  </Stack>
                </>
              )}

              {selectedType === 'plane' && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Plane Extent
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <TextField
                      label="Extent X"
                      type="number"
                      size="small"
                      value={planeExtentX}
                      onChange={(e) => setPlaneExtentX(+e.target.value)}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">m</InputAdornment>,
                      }}
                      inputProps={{ step: 0.01, min: 0.001 }}
                    />
                    <TextField
                      label="Extent Y"
                      type="number"
                      size="small"
                      value={planeExtentY}
                      onChange={(e) => setPlaneExtentY(+e.target.value)}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">m</InputAdornment>,
                      }}
                      inputProps={{ step: 0.01, min: 0.001 }}
                    />
                  </Stack>
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!selectedType}>
          Add Probe
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ProbePickerDialog;
