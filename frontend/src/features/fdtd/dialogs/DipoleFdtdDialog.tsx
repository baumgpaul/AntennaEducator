/**
 * DipoleFdtdDialog — Parametric dipole antenna generator for FDTD.
 *
 * Creates two thin PEC rods with a feed gap at the center.
 * Physics hint: resonance at λ/2 total length.
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
  Alert,
} from '@mui/material';
import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/store/hooks';
import {
  addStructure,
  addSource,
  setDomainSize,
  setCellSize,
  setDimensionality,
} from '@/store/fdtdDesignSlice';

const C0 = 299792458;

interface DipoleFdtdDialogProps {
  open: boolean;
  onClose: () => void;
}

function DipoleFdtdDialog({ open, onClose }: DipoleFdtdDialogProps) {
  const dispatch = useAppDispatch();

  const [totalLength, setTotalLength] = useState(62.5); // mm (half-wave at ~2.4 GHz)
  const [rodRadius, setRodRadius] = useState(1.0); // mm
  const [gapSize, setGapSize] = useState(2.0); // mm
  const [frequency, setFrequency] = useState(2.4); // GHz

  const physicsHint = useMemo(() => {
    const lambda = (C0 / (frequency * 1e9)) * 1000; // mm
    const halfWave = lambda / 2;
    const ratio = totalLength / halfWave;
    return {
      lambda: lambda.toFixed(1),
      halfWave: halfWave.toFixed(1),
      matchQuality:
        Math.abs(ratio - 1) < 0.1 ? 'good' : Math.abs(ratio - 1) < 0.25 ? 'fair' : 'off',
    };
  }, [totalLength, frequency]);

  const handleGenerate = () => {
    const totalM = totalLength / 1000;
    const radiusM = rodRadius / 1000;
    const gapM = gapSize / 1000;
    const armLength = (totalM - gapM) / 2;

    // Domain: dipole along X with generous padding for radiation
    const padX = totalM * 1.5;
    const padY = totalM * 1.0;
    const domX = totalM + 2 * padX;
    const domY = 2 * padY;
    const cellSz = Math.min(gapM / 4, radiusM);

    dispatch(setDimensionality('2d'));
    dispatch(setDomainSize([domX, domY, radiusM * 4]));
    dispatch(setCellSize([cellSz, cellSz, radiusM * 2]));

    const cx = domX / 2;
    const cy = domY / 2;

    // Left arm
    dispatch(
      addStructure({
        name: 'Dipole — Left Arm',
        type: 'box',
        position: [cx - gapM / 2 - armLength / 2, cy, 0],
        dimensions: { width: armLength, height: radiusM * 2, depth: radiusM * 2 },
        material: 'pec',
      }),
    );

    // Right arm
    dispatch(
      addStructure({
        name: 'Dipole — Right Arm',
        type: 'box',
        position: [cx + gapM / 2 + armLength / 2, cy, 0],
        dimensions: { width: armLength, height: radiusM * 2, depth: radiusM * 2 },
        material: 'pec',
      }),
    );

    // Feed source at gap center
    dispatch(
      addSource({
        name: 'Dipole Feed',
        type: 'gaussian_pulse',
        position: [cx, cy, 0],
        parameters: { amplitude: 1.0, width: 30, frequency: frequency * 1e9 },
        polarization: 'x',
      }),
    );

    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Dipole Antenna (FDTD)</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Design Frequency"
            type="number"
            value={frequency}
            onChange={(e) => setFrequency(+e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">GHz</InputAdornment> }}
            inputProps={{ step: 0.1, min: 0.01 }}
          />

          <Divider />
          <Typography variant="subtitle2">Dipole Geometry</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Total Length"
              type="number"
              value={totalLength}
              onChange={(e) => setTotalLength(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
            <TextField
              label="Rod Radius"
              type="number"
              value={rodRadius}
              onChange={(e) => setRodRadius(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.01 }}
            />
          </Stack>
          <TextField
            label="Gap Size"
            type="number"
            value={gapSize}
            onChange={(e) => setGapSize(+e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
            inputProps={{ step: 0.1, min: 0.1 }}
          />

          <Alert
            severity={
              physicsHint.matchQuality === 'good'
                ? 'success'
                : physicsHint.matchQuality === 'fair'
                  ? 'warning'
                  : 'info'
            }
          >
            λ/2 at {frequency} GHz = <strong>{physicsHint.halfWave} mm</strong> (λ ={' '}
            {physicsHint.lambda} mm).
            {physicsHint.matchQuality === 'good' && ' Length matches well!'}
            {physicsHint.matchQuality === 'fair' && ' Length is close — consider adjusting.'}
            {physicsHint.matchQuality === 'off' && ' Length is far from resonance.'}
          </Alert>

          {/* Schematic SVG */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <svg width="260" height="80" viewBox="0 0 260 80">
              {/* Left arm */}
              <rect x="30" y="35" width="90" height="10" fill="#333" stroke="#222" strokeWidth="1" rx="2" />
              {/* Right arm */}
              <rect x="140" y="35" width="90" height="10" fill="#333" stroke="#222" strokeWidth="1" rx="2" />
              {/* Gap */}
              <rect x="120" y="32" width="20" height="16" fill="none" stroke="#f44336" strokeWidth="1.5" strokeDasharray="3 2" />
              {/* Feed indicator */}
              <circle cx="130" cy="40" r="4" fill="#f44336" />
              <text x="130" y="25" textAnchor="middle" fontSize="9" fill="#c62828">Feed</text>
              {/* Dimension label */}
              <line x1="30" y1="60" x2="230" y2="60" stroke="#999" strokeWidth="1" />
              <polygon points="30,60 35,57 35,63" fill="#999" />
              <polygon points="230,60 225,57 225,63" fill="#999" />
              <text x="130" y="73" textAnchor="middle" fontSize="10" fill="#666">{totalLength} mm</text>
              {/* PEC labels */}
              <text x="75" y="30" textAnchor="middle" fontSize="8" fill="#888">PEC</text>
              <text x="185" y="30" textAnchor="middle" fontSize="8" fill="#888">PEC</text>
            </svg>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={gapSize >= totalLength}
        >
          Generate Dipole
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DipoleFdtdDialog;
