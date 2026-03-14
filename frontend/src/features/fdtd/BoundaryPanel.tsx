/**
 * BoundaryPanel — Per-face boundary condition configurator.
 *
 * Shows 6 face dropdowns (or 2 for 1D) with a "Set All" convenience button.
 * Visual color indicators matching the 3D scene overlays.
 */
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import { BorderAll as BoundaryIcon } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setBoundaries } from '@/store/fdtdDesignSlice';
import type { BoundaryType, DomainBoundaries, BoundaryCondition } from '@/types/fdtd';

const BC_OPTIONS: { value: BoundaryType; label: string; color: string }[] = [
  { value: 'mur_abc', label: 'Mur ABC (Absorbing)', color: '#4caf50' },
  { value: 'pec', label: 'PEC (Electric wall)', color: '#f44336' },
  { value: 'pmc', label: 'PMC (Magnetic wall)', color: '#2196f3' },
  { value: 'periodic', label: 'Periodic', color: '#ffeb3b' },
];

type FaceKey = keyof DomainBoundaries;

const FACES_2D: { key: FaceKey; label: string }[] = [
  { key: 'x_min', label: 'x_min (left)' },
  { key: 'x_max', label: 'x_max (right)' },
  { key: 'y_min', label: 'y_min (bottom)' },
  { key: 'y_max', label: 'y_max (top)' },
  { key: 'z_min', label: 'z_min' },
  { key: 'z_max', label: 'z_max' },
];

const FACES_1D: { key: FaceKey; label: string }[] = [
  { key: 'x_min', label: 'x_min (left)' },
  { key: 'x_max', label: 'x_max (right)' },
];

function BoundaryPanel() {
  const dispatch = useAppDispatch();
  const { boundaries, dimensionality } = useAppSelector((s) => s.fdtdDesign);
  const faces = dimensionality === '1d' ? FACES_1D : FACES_2D;

  const handleFaceChange = (faceKey: FaceKey, bcType: BoundaryType) => {
    dispatch(
      setBoundaries({
        ...boundaries,
        [faceKey]: { type: bcType },
      }),
    );
  };

  const handleSetAll = (bcType: BoundaryType) => {
    const bc: BoundaryCondition = { type: bcType };
    dispatch(
      setBoundaries({
        x_min: bc,
        x_max: bc,
        y_min: bc,
        y_max: bc,
        z_min: bc,
        z_max: bc,
      }),
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <BoundaryIcon fontSize="small" />
        <Typography variant="subtitle2">Boundary Conditions</Typography>
      </Stack>

      {/* Per-face selectors */}
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {faces.map(({ key, label }) => {
          const bc = boundaries[key];
          const opt = BC_OPTIONS.find((o) => o.value === bc.type);
          return (
            <Stack key={key} direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                sx={{
                  minWidth: 12,
                  height: 12,
                  bgcolor: opt?.color ?? '#888',
                  borderRadius: '50%',
                }}
                label=""
              />
              <Typography variant="caption" sx={{ minWidth: 90 }}>
                {label}
              </Typography>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select
                  value={bc.type}
                  onChange={(e) => handleFaceChange(key, e.target.value as BoundaryType)}
                >
                  {BC_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          );
        })}
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      {/* Set All buttons */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Set All Faces
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {BC_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            size="small"
            variant="outlined"
            onClick={() => handleSetAll(opt.value)}
            sx={{
              borderColor: opt.color,
              color: opt.color,
              '&:hover': { borderColor: opt.color, bgcolor: `${opt.color}15` },
            }}
          >
            {opt.value.replace(/_/g, ' ').toUpperCase()}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

export default BoundaryPanel;
