/**
 * CustomStructureDialog — Create a box, cylinder, or sphere with material selection.
 * Baseline geometry creator for the FDTD workspace.
 */
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  InputAdornment,
} from '@mui/material';
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addStructure } from '@/store/fdtdDesignSlice';
import type { FdtdStructureType } from '@/types/fdtd';

interface CustomStructureDialogProps {
  open: boolean;
  onClose: () => void;
}

const MATERIALS = [
  'vacuum', 'air', 'copper', 'aluminum', 'silver', 'gold', 'pec',
  'fr4', 'rogers_4003c', 'glass', 'teflon', 'water',
  'dry_soil', 'wet_soil', 'skin', 'bone', 'brain', 'muscle', 'fat',
];

const SHAPE_TYPES: { value: FdtdStructureType; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'cylinder', label: 'Cylinder' },
  { value: 'sphere', label: 'Sphere' },
];

function CustomStructureDialog({ open, onClose }: CustomStructureDialogProps) {
  const dispatch = useAppDispatch();
  const { domainSize, structures } = useAppSelector((s) => s.fdtdDesign);

  const [name, setName] = useState(`Structure ${structures.length + 1}`);
  const [shapeType, setShapeType] = useState<FdtdStructureType>('box');
  const [material, setMaterial] = useState('fr4');
  const [posX, setPosX] = useState(domainSize[0] / 2);
  const [posY, setPosY] = useState(domainSize[1] / 2);
  const [posZ, setPosZ] = useState(0);
  // Box dims
  const [width, setWidth] = useState(domainSize[0] * 0.3);
  const [height, setHeight] = useState(domainSize[1] * 0.3);
  const [depth, setDepth] = useState(0.01);
  // Cylinder / sphere
  const [radius, setRadius] = useState(domainSize[0] * 0.1);
  const [cylHeight, setCylHeight] = useState(domainSize[0] * 0.2);

  const handleAdd = () => {
    const dimensions: Record<string, number> =
      shapeType === 'box' || shapeType === 'substrate' || shapeType === 'trace'
        ? { width, height, depth }
        : shapeType === 'cylinder'
          ? { radius, height: cylHeight }
          : { radius };

    dispatch(
      addStructure({
        name,
        type: shapeType,
        position: [posX, posY, posZ],
        dimensions,
        material,
      }),
    );

    // Reset for next
    setName(`Structure ${structures.length + 2}`);
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Custom Structure</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Typography variant="subtitle2">Shape</Typography>
          <ToggleButtonGroup
            exclusive
            value={shapeType}
            onChange={(_, v) => v && setShapeType(v)}
            size="small"
          >
            {SHAPE_TYPES.map((s) => (
              <ToggleButton key={s.value} value={s.value}>
                {s.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <FormControl fullWidth>
            <InputLabel>Material</InputLabel>
            <Select value={material} label="Material" onChange={(e) => setMaterial(e.target.value)}>
              {MATERIALS.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />
          <Typography variant="subtitle2">Position [m]</Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="X"
              type="number"
              value={posX}
              onChange={(e) => setPosX(+e.target.value)}
              inputProps={{ step: 0.01 }}
              InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
            />
            <TextField
              label="Y"
              type="number"
              value={posY}
              onChange={(e) => setPosY(+e.target.value)}
              inputProps={{ step: 0.01 }}
              InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
            />
            <TextField
              label="Z"
              type="number"
              value={posZ}
              onChange={(e) => setPosZ(+e.target.value)}
              inputProps={{ step: 0.01 }}
              InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
            />
          </Stack>

          <Divider />
          <Typography variant="subtitle2">Dimensions</Typography>
          {(shapeType === 'box' || shapeType === 'substrate' || shapeType === 'trace') && (
            <Stack direction="row" spacing={1}>
              <TextField
                label="Width"
                type="number"
                value={width}
                onChange={(e) => setWidth(+e.target.value)}
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
              />
              <TextField
                label="Height"
                type="number"
                value={height}
                onChange={(e) => setHeight(+e.target.value)}
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
              />
              <TextField
                label="Depth"
                type="number"
                value={depth}
                onChange={(e) => setDepth(+e.target.value)}
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
              />
            </Stack>
          )}
          {shapeType === 'cylinder' && (
            <Stack direction="row" spacing={1}>
              <TextField
                label="Radius"
                type="number"
                value={radius}
                onChange={(e) => setRadius(+e.target.value)}
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
              />
              <TextField
                label="Height"
                type="number"
                value={cylHeight}
                onChange={(e) => setCylHeight(+e.target.value)}
                inputProps={{ step: 0.001, min: 0 }}
                InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
              />
            </Stack>
          )}
          {shapeType === 'sphere' && (
            <TextField
              label="Radius"
              type="number"
              value={radius}
              onChange={(e) => setRadius(+e.target.value)}
              inputProps={{ step: 0.001, min: 0 }}
              InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!name.trim()}>
          Add to Design
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CustomStructureDialog;
