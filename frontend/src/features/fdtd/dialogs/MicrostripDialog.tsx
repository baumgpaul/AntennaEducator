/**
 * MicrostripDialog — Parametric microstrip line generator.
 *
 * Creates: ground plane (PEC) + substrate (dielectric) + trace (copper) + feed source.
 * User can choose the feed position along the trace.
 * Physics hint shows approximate characteristic impedance.
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
  Slider,
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

interface MicrostripDialogProps {
  open: boolean;
  onClose: () => void;
}

function MicrostripDialog({ open, onClose }: MicrostripDialogProps) {
  const dispatch = useAppDispatch();

  // Substrate
  const [substrateLength, setSubstrateLength] = useState(50); // mm
  const [substrateWidth, setSubstrateWidth] = useState(30); // mm
  const [substrateHeight, setSubstrateHeight] = useState(1.6); // mm (FR-4)
  const [epsilonR, setEpsilonR] = useState(4.4);
  // Trace
  const [traceWidth, setTraceWidth] = useState(3.0); // mm
  const [traceLength, setTraceLength] = useState(40); // mm
  // Feed position (0 = left edge, 1 = right edge of trace)
  const [feedPosition, setFeedPosition] = useState(0);
  // Design frequency
  const [frequency, setFrequency] = useState(2.4); // GHz

  // Approximate Z₀ using Hammerstad–Jensen formula
  const physicsHint = useMemo(() => {
    const w = traceWidth / 1000;
    const h = substrateHeight / 1000;
    const ratio = w / h;
    const epsilonEff =
      (epsilonR + 1) / 2 + ((epsilonR - 1) / 2) * (1 / Math.sqrt(1 + 12 / ratio));
    let z0: number;
    if (ratio <= 1) {
      z0 = (60 / Math.sqrt(epsilonEff)) * Math.log(8 / ratio + ratio / 4);
    } else {
      z0 = (120 * Math.PI) / (Math.sqrt(epsilonEff) * (ratio + 1.393 + 0.667 * Math.log(ratio + 1.444)));
    }
    const lambda = (C0 / (frequency * 1e9)) * 1000; // mm
    const lambdaEff = lambda / Math.sqrt(epsilonEff);
    return {
      z0: z0.toFixed(1),
      epsilonEff: epsilonEff.toFixed(2),
      lambdaEff: lambdaEff.toFixed(1),
    };
  }, [traceWidth, substrateHeight, epsilonR, frequency]);

  const handleGenerate = () => {
    const subLenM = substrateLength / 1000;
    const subWidM = substrateWidth / 1000;
    const subHM = substrateHeight / 1000;
    const trWM = traceWidth / 1000;
    const trLM = traceLength / 1000;

    // Domain with padding
    const padX = subLenM * 0.5;
    const padY = subWidM * 0.5;
    const domX = subLenM + 2 * padX;
    const domY = subWidM + 2 * padY;
    const cellSz = Math.min(trWM, subHM) / 4;

    dispatch(setDimensionality('2d'));
    dispatch(setDomainSize([domX, domY, subHM * 4]));
    dispatch(setCellSize([cellSz, cellSz, subHM]));

    const cx = domX / 2;
    const cy = domY / 2;

    // Ground plane
    dispatch(
      addStructure({
        name: 'Ground Plane',
        type: 'substrate',
        position: [cx, cy, -subHM / 2],
        dimensions: { width: subLenM * 1.2, height: subWidM * 1.2, depth: 0.001 },
        material: 'pec',
      }),
    );

    // Substrate
    dispatch(
      addStructure({
        name: 'Substrate',
        type: 'substrate',
        position: [cx, cy, 0],
        dimensions: { width: subLenM, height: subWidM, depth: subHM },
        material: 'fr4',
      }),
    );

    // Microstrip trace
    dispatch(
      addStructure({
        name: 'Microstrip Trace',
        type: 'trace',
        position: [cx, cy, subHM / 2],
        dimensions: { width: trLM, height: trWM, depth: 0.001 },
        material: 'copper',
      }),
    );

    // Feed source at user-chosen position along trace
    const feedX = cx - trLM / 2 + feedPosition * trLM;
    dispatch(
      addSource({
        name: 'Microstrip Feed',
        type: 'gaussian_pulse',
        position: [feedX, cy, subHM / 2],
        parameters: { amplitude: 1.0, width: 30, frequency: frequency * 1e9 },
        polarization: 'z',
      }),
    );

    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Microstrip Line Generator</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Design Frequency"
            type="number"
            value={frequency}
            onChange={(e) => setFrequency(+e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">GHz</InputAdornment> }}
            inputProps={{ step: 0.1, min: 0.1 }}
          />

          <Divider />
          <Typography variant="subtitle2">Substrate</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Length"
              type="number"
              value={substrateLength}
              onChange={(e) => setSubstrateLength(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
            <TextField
              label="Width"
              type="number"
              value={substrateWidth}
              onChange={(e) => setSubstrateWidth(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Height"
              type="number"
              value={substrateHeight}
              onChange={(e) => setSubstrateHeight(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.01 }}
            />
            <TextField
              label="εᵣ"
              type="number"
              value={epsilonR}
              onChange={(e) => setEpsilonR(+e.target.value)}
              inputProps={{ step: 0.1, min: 1 }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Trace</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Trace Width"
              type="number"
              value={traceWidth}
              onChange={(e) => setTraceWidth(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.01 }}
            />
            <TextField
              label="Trace Length"
              type="number"
              value={traceLength}
              onChange={(e) => setTraceLength(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
          </Stack>

          <Alert
            severity={
              Math.abs(+physicsHint.z0 - 50) < 10
                ? 'success'
                : Math.abs(+physicsHint.z0 - 50) < 25
                  ? 'warning'
                  : 'info'
            }
          >
            Z₀ ≈ <strong>{physicsHint.z0} Ω</strong> (ε_eff ≈ {physicsHint.epsilonEff}, λ_eff ≈{' '}
            {physicsHint.lambdaEff} mm)
          </Alert>

          <Divider />
          <Typography variant="subtitle2">Feed Position</Typography>
          <Typography variant="body2" color="text.secondary">
            Slide to choose source position along the trace
          </Typography>
          <Box sx={{ px: 1 }}>
            <Slider
              value={feedPosition}
              onChange={(_, v) => setFeedPosition(v as number)}
              min={0}
              max={1}
              step={0.05}
              marks={[
                { value: 0, label: 'Left' },
                { value: 0.5, label: 'Center' },
                { value: 1, label: 'Right' },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
            />
          </Box>

          {/* Schematic SVG */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <svg width="240" height="100" viewBox="0 0 240 100">
              {/* Ground plane */}
              <rect x="20" y="70" width="200" height="8" fill="#333" stroke="#222" strokeWidth="1" />
              <text x="120" y="90" textAnchor="middle" fontSize="9" fill="#666">Ground (PEC)</text>
              {/* Substrate */}
              <rect x="30" y="45" width="180" height="25" fill="#2E7D32" opacity="0.3" stroke="#2E7D32" strokeWidth="1" />
              <text x="225" y="60" textAnchor="start" fontSize="9" fill="#2E7D32">Substrate</text>
              {/* Trace */}
              <rect x="50" y="40" width="140" height="5" fill="#B87333" stroke="#8B5A2B" strokeWidth="1" />
              <text x="120" y="35" textAnchor="middle" fontSize="9" fill="#8B5A2B">Trace</text>
              {/* Feed marker */}
              <circle cx={50 + feedPosition * 140} cy={42} r="4" fill="#f44336" stroke="#c62828" strokeWidth="1" />
              <text x={50 + feedPosition * 140} y="25" textAnchor="middle" fontSize="8" fill="#c62828">Feed</text>
            </svg>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate}>
          Generate Microstrip
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default MicrostripDialog;
