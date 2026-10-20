import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  TextField,
  MenuItem,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { evaluateParameters } from '../expressions';
import { TEMPLATES } from '../model';
import type { FemStudio } from '../useFemStudio';
import FieldViewer from '@/features/fieldview/FieldViewer';
import { boundsOf, fromTriangles2D } from '@/features/fieldview/fieldMesh';
import type { ColorMapType } from '@/utils/colorMaps';
import { si } from '../views/geometryDraw';
import { StepNotes } from './common';

type Field = 'potential' | 'E' | 'D';

function ResultsTab({ studio }: { studio: FemStudio }) {
  const { model, progress, busy, error, exportFiles } = studio;
  const result = studio.result?.data;
  const [field, setField] = useState<Field>('potential');
  const [contours, setContours] = useState(true);
  const [arrows, setArrows] = useState(true);
  const [colorMap, setColorMap] = useState<ColorMapType>('viridis');

  // The result as common field data for the shared viewer
  const fieldMesh = useMemo(() => {
    if (!result) return null;
    const { nodes, triangles } = result.mesh;
    if (field === 'potential') {
      return fromTriangles2D(nodes, triangles, { node: result.potential, cellVectors2D: result.electric_field }, 'V', 'V');
    }
    const v = field === 'E' ? result.electric_field : result.flux_density;
    const magnitude = Array.from({ length: v.length / 2 }, (_, e) => Math.hypot(v[2 * e], v[2 * e + 1]));
    // colours: the magnitude per element (constant on each P1 triangle); lines: equipotentials
    return fromTriangles2D(
      nodes,
      triangles,
      { node: result.potential, cell: magnitude, cellVectors2D: result.electric_field },
      field === 'E' ? '|E|' : '|D|',
      field === 'E' ? 'V/m' : 'C/m²',
    );
  }, [result, field]);
  const arrowSpacing = useMemo(() => {
    if (!fieldMesh) return 0;
    const b = boundsOf(fieldMesh);
    return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 18;
  }, [fieldMesh]);

  const template = TEMPLATES.find((t) => t.id === model.template);
  const analytic = useMemo(() => {
    if (!template?.analytic) return null;
    try {
      return { label: template.analytic.label, value: template.analytic.value(evaluateParameters(model.parameters), model) };
    } catch {
      return null;
    }
  }, [template, model]);

  if (!result) {
    return <Typography color="text.secondary">Solve the model on the Solve tab first.</Typography>;
  }
  const current = progress.done.has('results');
  const c = result.capacitance;
  const perDepth = model.depth === 1 ? ' (per metre)' : '';
  const diff = (v: number) => (analytic ? ` (${(100 * (v / analytic.value - 1)).toFixed(2)} %)` : '');

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        {!current && <StepNotes notes={['These results belong to an earlier version of the model: solve again.']} />}
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup size="small" exclusive value={field} onChange={(_, v) => v && setField(v)}>
            <ToggleButton value="potential">Potential V</ToggleButton>
            <ToggleButton value="E">|E|</ToggleButton>
            <ToggleButton value="D">|D|</ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch size="small" checked={contours} onChange={(e) => setContours(e.target.checked)} />} label="Equipotential lines" />
          <FormControlLabel control={<Switch size="small" checked={arrows} onChange={(e) => setArrows(e.target.checked)} />} label="Field arrows" />
          <TextField
            select
            size="small"
            label="Colours"
            value={colorMap}
            onChange={(e) => setColorMap(e.target.value as ColorMapType)}
            sx={{ minWidth: 120 }}
          >
            {(['viridis', 'plasma', 'turbo', 'jet'] as ColorMapType[]).map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {fieldMesh && (
          <FieldViewer
            mesh={fieldMesh}
            colorMap={colorMap}
            contours={contours ? 12 : 0}
            arrowSpacing={arrows ? arrowSpacing : 0}
            flat
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {field === 'potential'
            ? 'V is continuous and linear on each triangle. Field lines (arrows) cross the equipotential lines at right angles.'
            : 'E = −∇V is constant on each triangle (P1): fields are one order less accurate than the potential — refine where it changes fast.'}
        </Typography>
      </Paper>
      <Paper variant="outlined" sx={{ width: 420, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          {c && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Capacitance{perDepth}
              </Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ pl: 0 }}>from the charge, Q/ΔV</TableCell>
                    <TableCell align="right">{si(c.from_charge, 'F')}{diff(c.from_charge)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ pl: 0 }}>from the energy, 2W/ΔV²</TableCell>
                    <TableCell align="right">{si(c.from_energy, 'F')}{diff(c.from_energy)}</TableCell>
                  </TableRow>
                  {analytic && (
                    <TableRow>
                      <TableCell sx={{ pl: 0 }}>{analytic.label}</TableCell>
                      <TableCell align="right">{si(analytic.value, 'F')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary">
                Both FEM values agree to rounding: for two electrodes Q·ΔV = uᵀKu exactly. Refine the mesh and watch them
                converge — integral quantities are far more accurate than local fields.
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Charge on each electrode
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ pl: 0 }}>Boundary</TableCell>
                  <TableCell align="right">reaction K·u − f</TableCell>
                  <TableCell align="right" sx={{ pr: 0 }}>flux ∮ D·n</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(result.charge).map(([b, q]) => (
                  <TableRow key={b}>
                    <TableCell sx={{ pl: 0 }}>{b}</TableCell>
                    <TableCell align="right">{si(q, 'C')}</TableCell>
                    <TableCell align="right" sx={{ pr: 0 }}>{si(result.charge_from_flux[b], 'C')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary">
              The reaction charge uses the whole FE solution and converges faster than D·n of the elements at the
              boundary.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Field energy W = ½·uᵀKu{perDepth}: {si(result.energy, 'J')}
            </Typography>
            {Object.entries(result.energy_by_domain).map(([d, w]) => (
              <Typography key={d} variant="body2">
                {d}: {si(w, 'J')} ({((100 * w) / result.energy).toFixed(1)} %)
              </Typography>
            ))}
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              openCFS
            </Typography>
            <Button startIcon={<Download />} onClick={exportFiles} disabled={busy !== null}>
              {busy === 'export' ? 'Exporting…' : 'Export simulation.xml, mat.xml, model.msh'}
            </Button>
            <Typography variant="caption" color="text.secondary" display="block">
              Run the same model in openCFS: put the three files in one folder; simulation.xml is the input file.
            </Typography>
          </Box>
          <StepNotes error={error} />
        </Stack>
      </Paper>
    </Box>
  );
}

export default ResultsTab;
