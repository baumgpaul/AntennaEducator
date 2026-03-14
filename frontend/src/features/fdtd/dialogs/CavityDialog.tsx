/**
 * CavityDialog — Parametric resonant cavity generator.
 *
 * Creates a PEC rectangular box with a parametric slot opening
 * on a user-chosen face. Slot position, size, and orientation
 * are configurable.
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/store/hooks';
import {
  addStructure,
  setDomainSize,
  setCellSize,
  setDimensionality,
} from '@/store/fdtdDesignSlice';

const C0 = 299792458;

type SlotFace = 'x_min' | 'x_max' | 'y_min' | 'y_max';
type SlotOrientation = 'horizontal' | 'vertical';

interface CavityDialogProps {
  open: boolean;
  onClose: () => void;
}

function CavityDialog({ open, onClose }: CavityDialogProps) {
  const dispatch = useAppDispatch();

  // Cavity dimensions
  const [cavityA, setCavityA] = useState(40); // mm (x)
  const [cavityB, setCavityB] = useState(30); // mm (y)
  const [cavityDepth, setCavityDepth] = useState(20); // mm (z)
  const [wallThickness, setWallThickness] = useState(1.0); // mm

  // Slot parameters
  const [slotFace, setSlotFace] = useState<SlotFace>('x_max');
  const [slotOrientation, setSlotOrientation] = useState<SlotOrientation>('horizontal');
  const [slotWidth, setSlotWidth] = useState(2.0); // mm
  const [slotLength, setSlotLength] = useState(15.0); // mm
  const [slotOffset, setSlotOffset] = useState(0); // mm from center

  // Resonant frequency hint: TE₁₀₁ mode for rectangular cavity
  const physicsHint = useMemo(() => {
    const aM = cavityA / 1000;
    const bM = cavityB / 1000;
    const dM = cavityDepth / 1000;
    // f_mnp = c/(2) * sqrt((m/a)^2 + (n/b)^2 + (p/d)^2)
    // TE₁₀₁: m=1, n=0, p=1
    const f101 = (C0 / 2) * Math.sqrt(1 / (aM * aM) + 1 / (dM * dM));
    return {
      f101: (f101 / 1e9).toFixed(2),
    };
  }, [cavityA, cavityDepth]);

  const handleGenerate = () => {
    const aM = cavityA / 1000;
    const bM = cavityB / 1000;
    const dM = cavityDepth / 1000;
    const wt = wallThickness / 1000;

    const padX = aM * 0.5;
    const padY = bM * 0.5;
    const domX = aM + 2 * wt + 2 * padX;
    const domY = bM + 2 * wt + 2 * padY;
    const cellSz = Math.min(aM, bM) / 20;

    dispatch(setDimensionality('2d'));
    dispatch(setDomainSize([domX, domY, dM + 2 * wt]));
    dispatch(setCellSize([cellSz, cellSz, cellSz]));

    const cx = domX / 2;
    const cy = domY / 2;

    // Four walls of the cavity (2D cross-section)
    const walls: Array<{ name: string; pos: [number, number, number]; dim: Record<string, number> }> = [
      // Bottom wall
      {
        name: 'Cavity — Bottom Wall',
        pos: [cx, cy - bM / 2 - wt / 2, dM / 2],
        dim: { width: aM + 2 * wt, height: wt, depth: dM },
      },
      // Top wall
      {
        name: 'Cavity — Top Wall',
        pos: [cx, cy + bM / 2 + wt / 2, dM / 2],
        dim: { width: aM + 2 * wt, height: wt, depth: dM },
      },
      // Left wall
      {
        name: 'Cavity — Left Wall',
        pos: [cx - aM / 2 - wt / 2, cy, dM / 2],
        dim: { width: wt, height: bM, depth: dM },
      },
      // Right wall
      {
        name: 'Cavity — Right Wall',
        pos: [cx + aM / 2 + wt / 2, cy, dM / 2],
        dim: { width: wt, height: bM, depth: dM },
      },
    ];

    // Determine which wall to replace with slotted version
    const slotLenM = slotLength / 1000;
    const slotWidM = slotWidth / 1000;
    const slotOffM = slotOffset / 1000;

    for (const wall of walls) {
      const isSlotWall =
        (slotFace === 'x_min' && wall.name.includes('Left')) ||
        (slotFace === 'x_max' && wall.name.includes('Right')) ||
        (slotFace === 'y_min' && wall.name.includes('Bottom')) ||
        (slotFace === 'y_max' && wall.name.includes('Top'));

      if (isSlotWall) {
        // Split wall into two segments around the slot
        const isVerticalWall = slotFace === 'x_min' || slotFace === 'x_max';
        if (isVerticalWall) {
          // Wall runs along Y; slot cuts a horizontal or vertical opening
          const wallLen = bM;
          const halfSlot = slotLenM / 2;
          const slotCenter = slotOffM; // offset from wall center

          // Bottom segment
          const bottomLen = wallLen / 2 + slotCenter - halfSlot;
          if (bottomLen > 0.0001) {
            dispatch(
              addStructure({
                name: `${wall.name} (below slot)`,
                type: 'box',
                position: [wall.pos[0], cy - wallLen / 2 + bottomLen / 2, wall.pos[2]],
                dimensions: { width: wt, height: bottomLen, depth: dM },
                material: 'pec',
              }),
            );
          }
          // Top segment
          const topLen = wallLen / 2 - slotCenter - halfSlot;
          if (topLen > 0.0001) {
            dispatch(
              addStructure({
                name: `${wall.name} (above slot)`,
                type: 'box',
                position: [wall.pos[0], cy + wallLen / 2 - topLen / 2, wall.pos[2]],
                dimensions: { width: wt, height: topLen, depth: dM },
                material: 'pec',
              }),
            );
          }
        } else {
          // Wall runs along X; slot cuts an opening
          const wallLen = aM + 2 * wt;
          const halfSlot = slotLenM / 2;
          const slotCenter = slotOffM;

          // Left segment
          const leftLen = wallLen / 2 + slotCenter - halfSlot;
          if (leftLen > 0.0001) {
            dispatch(
              addStructure({
                name: `${wall.name} (left of slot)`,
                type: 'box',
                position: [cx - wallLen / 2 + leftLen / 2, wall.pos[1], wall.pos[2]],
                dimensions: { width: leftLen, height: wt, depth: dM },
                material: 'pec',
              }),
            );
          }
          // Right segment
          const rightLen = wallLen / 2 - slotCenter - halfSlot;
          if (rightLen > 0.0001) {
            dispatch(
              addStructure({
                name: `${wall.name} (right of slot)`,
                type: 'box',
                position: [cx + wallLen / 2 - rightLen / 2, wall.pos[1], wall.pos[2]],
                dimensions: { width: rightLen, height: wt, depth: dM },
                material: 'pec',
              }),
            );
          }
        }
      } else {
        // Full wall (no slot)
        dispatch(
          addStructure({
            name: wall.name,
            type: 'box',
            position: wall.pos,
            dimensions: wall.dim,
            material: 'pec',
          }),
        );
      }
    }

    onClose();
  };

  if (!open) return null;

  // SVG slot position indicator
  const svgSlotX =
    slotFace === 'x_min' ? 30 : slotFace === 'x_max' ? 190 : 110;
  const svgSlotY =
    slotFace === 'y_min' ? 90 : slotFace === 'y_max' ? 20 : 55;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Resonant Cavity with Slot</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="subtitle2">Cavity Dimensions</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Width (a)"
              type="number"
              value={cavityA}
              onChange={(e) => setCavityA(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
            <TextField
              label="Height (b)"
              type="number"
              value={cavityB}
              onChange={(e) => setCavityB(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
            <TextField
              label="Depth"
              type="number"
              value={cavityDepth}
              onChange={(e) => setCavityDepth(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 1, min: 0.1 }}
            />
          </Stack>
          <TextField
            label="Wall Thickness"
            type="number"
            value={wallThickness}
            onChange={(e) => setWallThickness(+e.target.value)}
            InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
            inputProps={{ step: 0.1, min: 0.1 }}
            sx={{ maxWidth: 200 }}
          />

          <Alert severity="info">
            TE₁₀₁ resonance: <strong>{physicsHint.f101} GHz</strong>
          </Alert>

          <Divider />
          <Typography variant="subtitle2">Slot Configuration</Typography>

          <FormControl fullWidth size="small">
            <InputLabel>Slot Face</InputLabel>
            <Select
              value={slotFace}
              label="Slot Face"
              onChange={(e) => setSlotFace(e.target.value as SlotFace)}
            >
              <MenuItem value="x_min">Left (−X)</MenuItem>
              <MenuItem value="x_max">Right (+X)</MenuItem>
              <MenuItem value="y_min">Bottom (−Y)</MenuItem>
              <MenuItem value="y_max">Top (+Y)</MenuItem>
            </Select>
          </FormControl>

          <Typography variant="caption" color="text.secondary">
            Orientation
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={slotOrientation}
            onChange={(_, v) => v && setSlotOrientation(v)}
            size="small"
          >
            <ToggleButton value="horizontal">Horizontal</ToggleButton>
            <ToggleButton value="vertical">Vertical</ToggleButton>
          </ToggleButtonGroup>

          <Stack direction="row" spacing={1}>
            <TextField
              label="Slot Length"
              type="number"
              value={slotLength}
              onChange={(e) => setSlotLength(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.5, min: 0.1 }}
            />
            <TextField
              label="Slot Width"
              type="number"
              value={slotWidth}
              onChange={(e) => setSlotWidth(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.1, min: 0.1 }}
            />
            <TextField
              label="Offset"
              type="number"
              value={slotOffset}
              onChange={(e) => setSlotOffset(+e.target.value)}
              InputProps={{ endAdornment: <InputAdornment position="end">mm</InputAdornment> }}
              inputProps={{ step: 0.5 }}
            />
          </Stack>

          {/* Schematic SVG */}
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <svg width="220" height="110" viewBox="0 0 220 110">
              {/* Cavity outline */}
              <rect x="30" y="20" width="160" height="70" fill="#e3f2fd" stroke="#666" strokeWidth="2" />
              {/* Wall labels */}
              <text x="110" y="12" textAnchor="middle" fontSize="9" fill="#666">+Y</text>
              <text x="110" y="103" textAnchor="middle" fontSize="9" fill="#666">−Y</text>
              <text x="20" y="58" textAnchor="middle" fontSize="9" fill="#666">−X</text>
              <text x="200" y="58" textAnchor="middle" fontSize="9" fill="#666">+X</text>
              {/* Slot indicator */}
              <circle cx={svgSlotX} cy={svgSlotY} r="6" fill="#f44336" opacity="0.7" />
              <text x={svgSlotX} y={svgSlotY - 10} textAnchor="middle" fontSize="8" fill="#c62828">Slot</text>
              {/* Dimensions */}
              <text x="110" y="58" textAnchor="middle" fontSize="10" fill="#333">{cavityA}×{cavityB} mm</text>
            </svg>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleGenerate}>
          Generate Cavity
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CavityDialog;
