/**
 * SourcePickerDialog — Choose and configure an FDTD excitation source.
 *
 * Enabled source types: gaussian_pulse, sinusoidal, modulated_gaussian.
 * Disabled (coming with 3D): plane_wave, waveguide_port.
 */
import {
  Box,
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
} from '@mui/material';
import {
  FlashOn as PulseIcon,
  GraphicEq as SineIcon,
  Waves as ModulatedIcon,
  Public as PlaneIcon,
  MeetingRoom as PortIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addSource } from '@/store/fdtdDesignSlice';
import type { FdtdSourceType } from '@/types/fdtd';

interface SourcePickerDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SourceOption {
  type: FdtdSourceType;
  label: string;
  description: string;
  icon: React.ReactElement;
  disabled?: boolean;
  disabledReason?: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    type: 'gaussian_pulse',
    label: 'Gaussian Pulse',
    description: 'Broadband excitation — ideal for frequency sweeps',
    icon: <PulseIcon />,
  },
  {
    type: 'sinusoidal',
    label: 'Sinusoidal (CW)',
    description: 'Single-frequency continuous wave',
    icon: <SineIcon />,
  },
  {
    type: 'modulated_gaussian',
    label: 'Modulated Gaussian',
    description: 'Gaussian envelope modulated by a carrier frequency',
    icon: <ModulatedIcon />,
  },
  {
    type: 'plane_wave',
    label: 'Plane Wave',
    description: 'Uniform plane wave excitation (requires TF/SF)',
    icon: <PlaneIcon />,
    disabled: true,
    disabledReason: 'Coming with 3D',
  },
  {
    type: 'waveguide_port',
    label: 'Waveguide Port',
    description: 'Modal excitation at a waveguide boundary',
    icon: <PortIcon />,
    disabled: true,
    disabledReason: 'Coming with 3D',
  },
];

function SourcePickerDialog({ open, onClose }: SourcePickerDialogProps) {
  const dispatch = useAppDispatch();
  const design = useAppSelector((s) => s.fdtdDesign);

  const [selectedType, setSelectedType] = useState<FdtdSourceType | null>(null);
  const [name, setName] = useState('');
  const [polarization, setPolarization] = useState<'x' | 'y' | 'z'>('z');

  // Gaussian pulse params
  const [amplitude, setAmplitude] = useState(1.0);
  const [pulseWidth, setPulseWidth] = useState(30);

  // Sinusoidal params
  const [frequency, setFrequency] = useState(1.0); // GHz

  // Modulated gaussian params
  const [carrierFreq, setCarrierFreq] = useState(2.4); // GHz
  const [bandwidth, setBandwidth] = useState(1.0); // GHz

  const handleAdd = () => {
    if (!selectedType) return;

    const pos: [number, number, number] =
      design.dimensionality === '1d'
        ? [design.domainSize[0] / 2, 0, 0]
        : [design.domainSize[0] / 2, design.domainSize[1] / 2, 0];

    const sourceName = name.trim() || `Source ${design.sources.length + 1}`;

    const parameters: Record<string, number> = { amplitude };
    if (selectedType === 'gaussian_pulse') {
      parameters.width = pulseWidth;
    } else if (selectedType === 'sinusoidal') {
      parameters.frequency = frequency * 1e9;
    } else if (selectedType === 'modulated_gaussian') {
      parameters.frequency = carrierFreq * 1e9;
      parameters.bandwidth = bandwidth * 1e9;
      parameters.width = pulseWidth;
    }

    dispatch(
      addSource({
        name: sourceName,
        type: selectedType,
        position: pos,
        parameters,
        polarization,
      }),
    );

    // Reset state
    setSelectedType(null);
    setName('');
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Source</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Source type selector */}
          <Typography variant="subtitle2">Source Type</Typography>
          <List dense disablePadding>
            {SOURCE_OPTIONS.map((opt) => (
              <ListItemButton
                key={opt.type}
                selected={selectedType === opt.type}
                disabled={opt.disabled}
                onClick={() => setSelectedType(opt.type)}
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

          {/* Parameters — shown only when a type is selected */}
          {selectedType && (
            <>
              <Divider />
              <Typography variant="subtitle2">Parameters</Typography>

              <TextField
                fullWidth
                label="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Source ${design.sources.length + 1}`}
              />

              <FormControl size="small" sx={{ maxWidth: 160 }}>
                <InputLabel>Polarization</InputLabel>
                <Select
                  value={polarization}
                  label="Polarization"
                  onChange={(e) => setPolarization(e.target.value as 'x' | 'y' | 'z')}
                >
                  <MenuItem value="x">X</MenuItem>
                  <MenuItem value="y">Y</MenuItem>
                  <MenuItem value="z">Z</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Amplitude"
                type="number"
                value={amplitude}
                onChange={(e) => setAmplitude(+e.target.value)}
                inputProps={{ step: 0.1, min: 0.001 }}
                sx={{ maxWidth: 200 }}
              />

              {(selectedType === 'gaussian_pulse' || selectedType === 'modulated_gaussian') && (
                <TextField
                  label="Pulse Width (time steps)"
                  type="number"
                  value={pulseWidth}
                  onChange={(e) => setPulseWidth(+e.target.value)}
                  inputProps={{ step: 5, min: 1 }}
                  sx={{ maxWidth: 250 }}
                />
              )}

              {selectedType === 'sinusoidal' && (
                <TextField
                  label="Frequency"
                  type="number"
                  value={frequency}
                  onChange={(e) => setFrequency(+e.target.value)}
                  InputProps={{ endAdornment: <InputAdornment position="end">GHz</InputAdornment> }}
                  inputProps={{ step: 0.1, min: 0.001 }}
                />
              )}

              {selectedType === 'modulated_gaussian' && (
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Carrier Frequency"
                    type="number"
                    value={carrierFreq}
                    onChange={(e) => setCarrierFreq(+e.target.value)}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">GHz</InputAdornment>,
                    }}
                    inputProps={{ step: 0.1, min: 0.001 }}
                  />
                  <TextField
                    label="Bandwidth"
                    type="number"
                    value={bandwidth}
                    onChange={(e) => setBandwidth(+e.target.value)}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">GHz</InputAdornment>,
                    }}
                    inputProps={{ step: 0.1, min: 0.001 }}
                  />
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!selectedType}>
          Add Source
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SourcePickerDialog;
