/**
 * PatchAntennaDialog — Parametric patch antenna generator.
 *
 * Creates: substrate slab + copper patch + ground plane + feed source.
 * Includes physics hint: Patch Length ≈ λ/2 at given frequency.
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
  Alert,
} from '@mui/material';
import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { addStructure, addSource, setDomainSize, setCellSize, setDimensionality } from '@/store/fdtdDesignSlice';

// Speed of light
const C0 = 299792458;

interface PatchAntennaDialogProps {
  open: boolean;
  onClose: () => void;
}

function PatchAntennaDialog({ open, onClose }: PatchAntennaDialogProps) {
  const dispatch = useAppDispatch();

  // Patch parameters
  const [patchLength, setPatchLength] = useState(0.03); // 30 mm
  const [patchWidth, setPatchWidth] = useState(0.04); // 40 mm
  const [substrateHeight, setSubstrateHeight] = useState(0.0016); // 1.6 mm (FR-4)
  const [epsilonR, setEpsilonR] = useState(4.4); // FR-4
  const [feedOffsetX, setFeedOffsetX] = useState(0.005); // 5 mm from center edge
  const [frequency, setFrequency] = useState(2.4e9); // 2.4 GHz

  // Physics hint: patch resonant length ≈ c / (2 * f * sqrt(ε_eff))
  const physicsHint = useMemo(() => {
    const epsilonEff =
      (epsilonR + 1) / 2 + ((epsilonR - 1) / 2) * (1 / Math.sqrt(1 + 12 * (substrateHeight / patchWidth)));
    const lambda = C0 / (frequency * Math.sqrt(epsilonEff));
    const recommendedLength = lambda / 2;
    return {
      epsilonEff: epsilonEff.toFixed(2),
      lambda: (lambda * 1000).toFixed(1),
      recommendedLength: (recommendedLength * 1000).toFixed(1),
      matchQuality: Math.abs(patchLength - recommendedLength) / recommendedLength < 0.1
        ? 'good'
        : Math.abs(patchLength - recommendedLength) / recommendedLength < 0.25
          ? 'fair'
          : 'off',
    };
  }, [patchLength, patchWidth, substrateHeight, epsilonR, frequency]);

  const handleGenerate = () => {
    // Set 2D mode + domain to fit the antenna with padding
    const padX = patchLength * 2;
    const padY = patchWidth * 2;
    const domX = patchLength + 2 * padX;
    const domY = patchWidth + 2 * padY;
    const cellSz = Math.min(patchLength, patchWidth) / 20; // ~20 cells across smallest patch dim

    dispatch(setDimensionality('2d'));
    dispatch(setDomainSize([domX, domY, substrateHeight * 2]));
    dispatch(setCellSize([cellSz, cellSz, substrateHeight]));

    const cx = domX / 2;
    const cy = domY / 2;

    // Ground plane (full domain, PEC)
    dispatch(
      addStructure({
        name: 'Ground Plane',
        type: 'substrate',
        position: [cx, cy, -substrateHeight / 2],
        dimensions: { width: domX, height: domY, depth: 0.001 },
        material: 'pec',
      }),
    );

    // Substrate (FR-4)
    dispatch(
      addStructure({
        name: 'Substrate (FR-4)',
        type: 'substrate',
        position: [cx, cy, 0],
        dimensions: { width: patchLength * 1.5, height: patchWidth * 1.5, depth: substrateHeight },
        material: 'fr4',
      }),
    );

    // Copper patch
    dispatch(
      addStructure({
        name: 'Copper Patch',
        type: 'trace',
        position: [cx, cy, substrateHeight / 2],
        dimensions: { width: patchLength, height: patchWidth, depth: 0.001 },
        material: 'copper',
      }),
    );

    // Feed source (Gaussian pulse at edge-offset position)
    dispatch(
      addSource({
        name: 'Patch Feed',
        type: 'gaussian_pulse',
        position: [cx - patchLength / 2 + feedOffsetX, cy, substrateHeight / 2],
        parameters: {
          amplitude: 1.0,
          width: 30,
          frequency: frequency,
        },
        polarization: 'z',
      }),
    );

    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Patch Antenna Generator</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Design frequency */}
          <TextField
            fullWidth
            label="Design Frequency"
            type="number"
            value={frequency / 1e9}
            onChange={(e) => setFrequency(+e.target.value * 1e9)}
            InputProps={{ endAdornment: <InputAdornment position="end">GHz</InputAdornment> }}
            inputProps={{ step: 0.1, min: 0.1 }}
          />

          <Divider />
          <Typography variant="subtitle2">Patch Dimensions</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Patch Length"
              type="number"
              value={patchLength * 1000}
              onChange={(e) => setPatchLength(+e.target.value / 1000)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
            <TextField
              label="Patch Width"
              type="number"
              value={patchWidth * 1000}
              onChange={(e) => setPatchWidth(+e.target.value / 1000)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
          </Stack>

          <Alert
            severity={physicsHint.matchQuality === 'good' ? 'success' : physicsHint.matchQuality === 'fair' ? 'warning' : 'info'}
          >
            Resonant length at {(frequency / 1e9).toFixed(1)} GHz (ε_eff ≈ {physicsHint.epsilonEff}):
            <strong> ≈ {physicsHint.recommendedLength} mm</strong> (λ/2 = {(+physicsHint.lambda / 2).toFixed(1)} mm)
          </Alert>

          <Divider />
          <Typography variant="subtitle2">Substrate</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Substrate Height"
              type="number"
              value={substrateHeight * 1000}
              onChange={(e) => setSubstrateHeight(+e.target.value / 1000)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.1 }}
            />
            <TextField
              label="εᵣ (relative permittivity)"
              type="number"
              value={epsilonR}
              onChange={(e) => setEpsilonR(+e.target.value)}
              inputProps={{ step: 0.1, min: 1 }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Feed</Typography>
          <TextField
            label="Feed Offset from Edge"
            type="number"
            value={feedOffsetX * 1000}
            onChange={(e) => setFeedOffsetX(+e.target.value / 1000)}
            InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
            inputProps={{ step: 0.5, min: 0 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate}>
          Generate Patch Antenna
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PatchAntennaDialog;
