import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, CropSquare, Delete, PanoramaFishEye, ChangeHistory } from '@mui/icons-material';
import type { Expr } from '../expressions';
import { EMPTY_MODEL, TEMPLATES, type Shape } from '../model';
import type { FemStudio } from '../useFemStudio';
import GeometryView from '../views/GeometryView';
import { evaluateShapes } from '../views/geometryDraw';
import { ExprField, Section, StepNotes } from './common';

function uniqueName(base: string, taken: string[]) {
  let i = 1;
  while (taken.includes(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function GeometryTab({ studio }: { studio: FemStudio }) {
  const { model, update, load, runMesh, busy, error, progress } = studio;
  const [selected, setSelected] = useState<string | null>(null);
  const drawn = evaluateShapes(model);
  const names = model.shapes.map((s) => s.name);

  const setShape = (i: number, shape: Shape) =>
    update((m) => {
      const old = m.shapes[i].name;
      const shapes = m.shapes.map((s, k) => (k === i ? shape : s));
      if (shape.name === old) return { ...m, shapes };
      // keep the shape's role and assignments when it is renamed
      const rename = (n: string) => (n === old ? shape.name : n);
      const materials = Object.fromEntries(Object.entries(m.materials).map(([k, v]) => [rename(k), v]));
      return {
        ...m,
        shapes,
        holes: m.holes.map(rename),
        materials,
        boundary_conditions: m.boundary_conditions.map((bc) => ({ ...bc, boundary: rename(bc.boundary) })),
        sources: m.sources.map((s) => ({ ...s, domain: rename(s.domain) })),
      };
    });
  const field = (i: number, key: string) => (v: Expr) => setShape(i, { ...model.shapes[i], [key]: v } as Shape);

  const add = (kind: Shape['kind']) => {
    const name = uniqueName(kind === 'rectangle' ? 'rect' : kind, names);
    const shape: Shape =
      kind === 'rectangle'
        ? { kind, name, x: 0, y: 0, width: 0.01, height: 0.01 }
        : kind === 'circle'
          ? { kind, name, cx: 0, cy: 0, r: 0.005 }
          : { kind, name, points: [[0, 0], [0.01, 0], [0, 0.01]] };
    update((m) => ({ ...m, shapes: [...m.shapes, shape] }));
    setSelected(name);
  };
  const move = (i: number, d: -1 | 1) =>
    update((m) => {
      const shapes = [...m.shapes];
      [shapes[i], shapes[i + d]] = [shapes[i + d], shapes[i]];
      return { ...m, shapes };
    });

  const meshed = progress.done.has('geometry');

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ width: 380, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          <TextField
            select
            size="small"
            label="Start from"
            value=""
            onChange={(e) => {
              const t = TEMPLATES.find((x) => x.id === e.target.value);
              load(t ? t.model : EMPTY_MODEL);
              setSelected(null);
            }}
          >
            {TEMPLATES.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.title}
              </MenuItem>
            ))}
            <MenuItem value="empty">Empty model</MenuItem>
          </TextField>
          {model.template && (
            <Typography variant="body2" color="text.secondary">
              {TEMPLATES.find((t) => t.id === model.template)?.description}
            </Typography>
          )}

          <Section title="Parameters (use them in any dimension)">
            {Object.entries(model.parameters).map(([name, value], i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <TextField
                  size="small"
                  label="Name"
                  value={name}
                  sx={{ width: 90 }}
                  onChange={(e) =>
                    update((m) => ({
                      ...m,
                      parameters: Object.fromEntries(
                        Object.entries(m.parameters).map(([k, v]) => [k === name ? e.target.value : k, v]),
                      ),
                    }))
                  }
                />
                <ExprField
                  label="Value"
                  value={value}
                  width={150}
                  onChange={(v) => update((m) => ({ ...m, parameters: { ...m.parameters, [name]: v } }))}
                />
                <IconButton
                  size="small"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    update((m) => {
                      const p = { ...m.parameters };
                      delete p[name];
                      return { ...m, parameters: p };
                    })
                  }
                >
                  <Delete fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Box>
              <Button
                size="small"
                startIcon={<Add />}
                onClick={() =>
                  update((m) => ({ ...m, parameters: { ...m.parameters, [uniqueName('p', Object.keys(m.parameters))]: 0 } }))
                }
              >
                Parameter
              </Button>
            </Box>
          </Section>

          <Section title="Shapes (later ones win where they overlap)">
            {model.shapes.map((s, i) => (
              <Paper
                key={i}
                variant="outlined"
                sx={{ p: 1, borderColor: s.name === selected ? 'error.main' : undefined }}
                onClick={() => setSelected(s.name)}
              >
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      label={s.kind}
                      value={s.name}
                      sx={{ flex: 1 }}
                      onChange={(e) => setShape(i, { ...s, name: e.target.value })}
                    />
                    <Tooltip title="Hole: cut out, not meshed (e.g. the inside of an electrode)">
                      <FormControlLabel
                        label="hole"
                        control={
                          <Checkbox
                            size="small"
                            checked={model.holes.includes(s.name)}
                            onChange={(e) =>
                              update((m) => ({
                                ...m,
                                holes: e.target.checked ? [...m.holes, s.name] : m.holes.filter((h) => h !== s.name),
                              }))
                            }
                          />
                        }
                      />
                    </Tooltip>
                    <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label="Move down" disabled={i === model.shapes.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => update((m) => ({ ...m, shapes: m.shapes.filter((_, k) => k !== i), holes: m.holes.filter((h) => h !== s.name) }))}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {s.kind === 'rectangle' && (
                      <>
                        <ExprField label="x" value={s.x} onChange={field(i, 'x')} width={80} />
                        <ExprField label="y" value={s.y} onChange={field(i, 'y')} width={80} />
                        <ExprField label="width" value={s.width} onChange={field(i, 'width')} width={80} />
                        <ExprField label="height" value={s.height} onChange={field(i, 'height')} width={80} />
                      </>
                    )}
                    {s.kind === 'circle' && (
                      <>
                        <ExprField label="cx" value={s.cx} onChange={field(i, 'cx')} width={90} />
                        <ExprField label="cy" value={s.cy} onChange={field(i, 'cy')} width={90} />
                        <ExprField label="r" value={s.r} onChange={field(i, 'r')} width={90} />
                      </>
                    )}
                    {s.kind === 'polygon' &&
                      s.points.map(([x, y], k) => (
                        <Stack key={k} direction="row" spacing={0.5}>
                          <ExprField
                            label={`x${k + 1}`}
                            value={x}
                            width={70}
                            onChange={(v) => setShape(i, { ...s, points: s.points.map((p, j) => (j === k ? [v, p[1]] : p)) })}
                          />
                          <ExprField
                            label={`y${k + 1}`}
                            value={y}
                            width={70}
                            onChange={(v) => setShape(i, { ...s, points: s.points.map((p, j) => (j === k ? [p[0], v] : p)) })}
                          />
                        </Stack>
                      ))}
                    {s.kind === 'polygon' && (
                      <Button size="small" onClick={() => setShape(i, { ...s, points: [...s.points, s.points[s.points.length - 1]] })}>
                        + point
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            ))}
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<CropSquare />} onClick={() => add('rectangle')}>
                Rectangle
              </Button>
              <Button size="small" startIcon={<PanoramaFishEye />} onClick={() => add('circle')}>
                Circle
              </Button>
              <Button size="small" startIcon={<ChangeHistory />} onClick={() => add('polygon')}>
                Polygon
              </Button>
            </Stack>
          </Section>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <StepNotes notes={progress.notes.geometry} error={error} />
        <GeometryView shapes={drawn.shapes} bounds={drawn.bounds} holes={model.holes} selected={selected} onSelect={setSelected} />
        <Stack direction="row" spacing={2} alignItems="center">
          <Button variant="contained" onClick={runMesh} disabled={busy !== null || !!drawn.error || model.shapes.length === 0}>
            {busy === 'mesh' ? 'Meshing…' : 'Find domains & boundaries'}
          </Button>
          <Typography variant="body2" color="text.secondary">
            The mesher splits the shapes into domains and names their boundaries — materials and conditions attach to these.
          </Typography>
        </Stack>
        {meshed && studio.mesh && (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="body2">Domains:</Typography>
              {progress.domains.map((d) => (
                <Chip key={d} size="small" label={d} />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="body2">Boundaries:</Typography>
              {progress.boundaries.map((b) => (
                <Chip key={b} size="small" variant="outlined" label={b} />
              ))}
            </Stack>
            {studio.mesh.warnings.map((w) => (
              <Typography key={w} variant="body2" color="warning.main">
                {w}
              </Typography>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default GeometryTab;
