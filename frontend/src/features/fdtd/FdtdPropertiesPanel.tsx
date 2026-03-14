/**
 * FdtdPropertiesPanel — Right sidebar for editing selected element properties.
 *
 * Shows different form fields depending on the selected category
 * (structure, source, probe) and dispatches updates to the Redux store.
 */
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Chip,
  Divider,
} from '@mui/material';
import {
  ViewInAr as StructureIcon,
  FlashOn as SourceIcon,
  GpsFixed as ProbeIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { updateStructure, updateSource, updateProbe } from '@/store/fdtdDesignSlice';
import type { FdtdTreeCategory } from './FdtdTreeView';
import type { FdtdStructure, FdtdSource, FdtdProbe } from '@/types/fdtd';

interface FdtdPropertiesPanelProps {
  selectedId: string | null;
  selectedCategory: FdtdTreeCategory | null;
}

const MATERIALS = [
  'vacuum', 'air', 'copper', 'aluminum', 'silver', 'gold', 'pec',
  'fr4', 'rogers_4003c', 'glass', 'teflon', 'water',
  'dry_soil', 'wet_soil', 'skin', 'bone', 'brain', 'muscle', 'fat',
];

function FdtdPropertiesPanel({ selectedId, selectedCategory }: FdtdPropertiesPanelProps) {
  const dispatch = useAppDispatch();
  const { structures, sources, probes } = useAppSelector((s) => s.fdtdDesign);

  if (!selectedId || !selectedCategory) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Select an element from the tree to edit its properties.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (selectedCategory === 'structure') {
    const struct = structures.find((s) => s.id === selectedId);
    if (!struct) return null;
    return <StructureProperties structure={struct} dispatch={dispatch} />;
  }

  if (selectedCategory === 'source') {
    const src = sources.find((s) => s.id === selectedId);
    if (!src) return null;
    return <SourceProperties source={src} dispatch={dispatch} />;
  }

  if (selectedCategory === 'probe') {
    const probe = probes.find((p) => p.id === selectedId);
    if (!probe) return null;
    return <ProbeProperties probe={probe} dispatch={dispatch} />;
  }

  return null;
}

// ─── Structure Properties ───

function StructureProperties({
  structure,
  dispatch,
}: {
  structure: FdtdStructure;
  dispatch: ReturnType<typeof useAppDispatch>;
}) {
  const update = (partial: Partial<FdtdStructure>) => {
    dispatch(updateStructure({ ...structure, ...partial }));
  };

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <StructureIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2">{structure.name}</Typography>
        <Chip label={structure.type} size="small" variant="outlined" />
      </Stack>
      <Divider sx={{ mb: 1.5 }} />

      <TextField
        fullWidth
        size="small"
        label="Name"
        value={structure.name}
        onChange={(e) => update({ name: e.target.value })}
        sx={{ mb: 1.5 }}
      />

      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel>Material</InputLabel>
        <Select
          value={structure.material}
          label="Material"
          onChange={(e) => update({ material: e.target.value })}
        >
          {MATERIALS.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Position [m]
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <TextField
            key={axis}
            size="small"
            label={axis.toUpperCase()}
            type="number"
            value={structure.position[i]}
            onChange={(e) => {
              const pos = [...structure.position] as [number, number, number];
              pos[i] = +e.target.value;
              update({ position: pos });
            }}
            inputProps={{ step: 0.01 }}
          />
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Dimensions
      </Typography>
      {Object.entries(structure.dimensions).map(([key, val]) => (
        <TextField
          key={key}
          fullWidth
          size="small"
          label={key}
          type="number"
          value={val}
          onChange={(e) =>
            update({ dimensions: { ...structure.dimensions, [key]: +e.target.value } })
          }
          inputProps={{ step: 0.001 }}
          sx={{ mb: 1 }}
        />
      ))}
    </Box>
  );
}

// ─── Source Properties ───

function SourceProperties({
  source,
  dispatch,
}: {
  source: FdtdSource;
  dispatch: ReturnType<typeof useAppDispatch>;
}) {
  const update = (partial: Partial<FdtdSource>) => {
    dispatch(updateSource({ ...source, ...partial }));
  };

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <SourceIcon fontSize="small" color="warning" />
        <Typography variant="subtitle2">{source.name}</Typography>
        <Chip label={source.type.replace(/_/g, ' ')} size="small" variant="outlined" />
      </Stack>
      <Divider sx={{ mb: 1.5 }} />

      <TextField
        fullWidth
        size="small"
        label="Name"
        value={source.name}
        onChange={(e) => update({ name: e.target.value })}
        sx={{ mb: 1.5 }}
      />

      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel>Polarization</InputLabel>
        <Select
          value={source.polarization}
          label="Polarization"
          onChange={(e) => update({ polarization: e.target.value as 'x' | 'y' | 'z' })}
        >
          <MenuItem value="x">X</MenuItem>
          <MenuItem value="y">Y</MenuItem>
          <MenuItem value="z">Z</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Position [m]
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <TextField
            key={axis}
            size="small"
            label={axis.toUpperCase()}
            type="number"
            value={source.position[i]}
            onChange={(e) => {
              const pos = [...source.position] as [number, number, number];
              pos[i] = +e.target.value;
              update({ position: pos });
            }}
            inputProps={{ step: 0.01 }}
          />
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Parameters
      </Typography>
      {Object.entries(source.parameters).map(([key, val]) => (
        <TextField
          key={key}
          fullWidth
          size="small"
          label={key}
          type="number"
          value={val}
          onChange={(e) =>
            update({ parameters: { ...source.parameters, [key]: +e.target.value } })
          }
          inputProps={{ step: key === 'amplitude' ? 0.1 : 1 }}
          sx={{ mb: 1 }}
        />
      ))}
    </Box>
  );
}

// ─── Probe Properties ───

function ProbeProperties({
  probe,
  dispatch,
}: {
  probe: FdtdProbe;
  dispatch: ReturnType<typeof useAppDispatch>;
}) {
  const update = (partial: Partial<FdtdProbe>) => {
    dispatch(updateProbe({ ...probe, ...partial }));
  };

  return (
    <Box sx={{ p: 1.5, overflow: 'auto', height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ProbeIcon fontSize="small" color="success" />
        <Typography variant="subtitle2">{probe.name}</Typography>
        <Chip label={probe.type} size="small" variant="outlined" />
      </Stack>
      <Divider sx={{ mb: 1.5 }} />

      <TextField
        fullWidth
        size="small"
        label="Name"
        value={probe.name}
        onChange={(e) => update({ name: e.target.value })}
        sx={{ mb: 1.5 }}
      />

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Position [m]
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <TextField
            key={axis}
            size="small"
            label={axis.toUpperCase()}
            type="number"
            value={probe.position[i]}
            onChange={(e) => {
              const pos = [...probe.position] as [number, number, number];
              pos[i] = +e.target.value;
              update({ position: pos });
            }}
            inputProps={{ step: 0.01 }}
          />
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Monitored Fields
      </Typography>
      <Typography variant="body2">{probe.fields.join(', ')}</Typography>
    </Box>
  );
}

export default FdtdPropertiesPanel;
