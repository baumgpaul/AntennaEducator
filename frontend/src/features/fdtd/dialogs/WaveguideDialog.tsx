/**
 * WaveguideDialog — Parametric rectangular waveguide generator.
 *
 * Creates a PEC rectangular box with open ends. The user specifies
 * the cross-section (a × b) and length. A physics hint shows
 * the TE₁₀ cutoff frequency.
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
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addStructure, setDomainSize, setCellSize, setDimensionality } from '@/store/fdtdDesignSlice';

const C0 = 299792458;

interface WaveguideDialogProps {
  open: boolean;
  onClose: () => void;
}

function WaveguideDialog({ open, onClose }: WaveguideDialogProps) {
  const dispatch = useAppDispatch();
  const { structures } = useAppSelector((s) => s.fdtdDesign);

  const [name, setName] = useState('Waveguide');
  const [a, setA] = useState(22.86); // WR-90 standard width [mm]
  const [b, setB] = useState(10.16); // WR-90 standard height [mm]
  const [length, setLength] = useState(100); // 100 mm

  // TE₁₀ cutoff frequency: fc = c / (2a)
  const physicsHint = useMemo(() => {
    const aMeters = a / 1000;
    const fc = C0 / (2 * aMeters);
    return {
      fc: (fc / 1e9).toFixed(2),
      lambdaC: (C0 / fc * 1000).toFixed(1),
    };
  }, [a]);

  const handleGenerate = () => {
    const aM = a / 1000;
    const bM = b / 1000;
    const lenM = length / 1000;

    // Domain: waveguide cross-section with padding
    const padX = aM * 0.5;
    const padY = bM * 0.5;
    const domX = aM + 2 * padX;
    const domY = bM + 2 * padY;
    const cellSz = Math.min(aM, bM) / 20;

    dispatch(setDimensionality('2d'));
    dispatch(setDomainSize([domX, domY, lenM]));
    dispatch(setCellSize([cellSz, cellSz, cellSz]));

    const cx = domX / 2;
    const cy = domY / 2;

    // Bottom wall
    dispatch(
      addStructure({
        name: `${name} — Bottom Wall`,
        type: 'box',
        position: [cx, cy - bM / 2, lenM / 2],
        dimensions: { width: aM, height: cellSz, depth: lenM },
        material: 'pec',
      }),
    );

    // Top wall
    dispatch(
      addStructure({
        name: `${name} — Top Wall`,
        type: 'box',
        position: [cx, cy + bM / 2, lenM / 2],
        dimensions: { width: aM, height: cellSz, depth: lenM },
        material: 'pec',
      }),
    );

    // Left wall
    dispatch(
      addStructure({
        name: `${name} — Left Wall`,
        type: 'box',
        position: [cx - aM / 2, cy, lenM / 2],
        dimensions: { width: cellSz, height: bM, depth: lenM },
        material: 'pec',
      }),
    );

    // Right wall
    dispatch(
      addStructure({
        name: `${name} — Right Wall`,
        type: 'box',
        position: [cx + aM / 2, cy, lenM / 2],
        dimensions: { width: cellSz, height: bM, depth: lenM },
        material: 'pec',
      }),
    );

    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Rectangular Waveguide</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Divider />
          <Typography variant="subtitle2">Cross-Section</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Width (a)"
              type="number"
              value={a}
              onChange={(e) => setA(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.1 }}
            />
            <TextField
              label="Height (b)"
              type="number"
              value={b}
              onChange={(e) => setB(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.1 }}
            />
          </Stack>

          <TextField
            label="Length"
            type="number"
            value={length}
            onChange={(e) => setLength(+e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
            inputProps={{ step: 1, min: 0.1 }}
          />

          <Alert severity="info">
            TE₁₀ cutoff: <strong>{physicsHint.fc} GHz</strong> (λ_c = {physicsHint.lambdaC} mm).
            Operate above this frequency for propagation.
          </Alert>

          {/* Schematic SVG */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <svg width="220" height="120" viewBox="0 0 220 120">
              {/* Waveguide outline */}
              <rect x="30" y="20" width="160" height="80" fill="none" stroke="#666" strokeWidth="2" />
              {/* Inner cavity */}
              <rect x="50" y="35" width="120" height="50" fill="#e3f2fd" stroke="#1976d2" strokeWidth="1.5" strokeDasharray="4 2" />
              {/* Dimension labels */}
              <text x="110" y="15" textAnchor="middle" fontSize="11" fill="#333">a = {a} mm</text>
              <text x="15" y="62" textAnchor="middle" fontSize="11" fill="#333" transform="rotate(-90, 15, 62)">b = {b} mm</text>
              {/* Arrow for a */}
              <line x1="50" y1="92" x2="170" y2="92" stroke="#999" strokeWidth="1" />
              <polygon points="50,92 55,89 55,95" fill="#999" />
              <polygon points="170,92 165,89 165,95" fill="#999" />
              {/* PEC labels */}
              <text x="110" y="107" textAnchor="middle" fontSize="10" fill="#888">PEC walls</text>
            </svg>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate} disabled={!name.trim()}>
          Generate Waveguide
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default WaveguideDialog;
