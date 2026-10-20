import { useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
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
import {
  AccountTree,
  Add,
  ArrowDownward,
  ArrowUpward,
  ChangeHistory,
  CropSquare,
  Delete,
  PanoramaFishEye,
} from '@mui/icons-material';
import { Hint, PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import type { Expr } from '../expressions';
import { EMPTY_MODEL, TEMPLATES, type Shape } from '../model';
import type { FemStudio } from '../useFemStudio';
import GeometryView from '../views/GeometryView';
import { evaluateShapes } from '../views/geometryDraw';
import { ExprField, StepNotes } from './common';

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
  const notes = progress.notes.geometry;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Template">
            <TextField
              select
              size="small"
              value=""
              label="Start from"
              sx={{ width: 190 }}
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
          </RibbonGroup>
          <RibbonGroup label="Add shape">
            <ButtonGroup variant="outlined" size="small">
              <Button startIcon={<CropSquare />} onClick={() => add('rectangle')}>
                Rectangle
              </Button>
              <Button startIcon={<PanoramaFishEye />} onClick={() => add('circle')}>
                Circle
              </Button>
              <Button startIcon={<ChangeHistory />} onClick={() => add('polygon')}>
                Polygon
              </Button>
            </ButtonGroup>
          </RibbonGroup>
          <RibbonGroup label="Domains & boundaries">
            <Tooltip title="The mesher splits the shapes into domains and names their boundaries — materials and conditions attach to these.">
              <span>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AccountTree />}
                  onClick={runMesh}
                  disabled={busy !== null || !!drawn.error || model.shapes.length === 0}
                >
                  {busy === 'mesh' ? 'Meshing…' : 'Find domains & boundaries'}
                </Button>
              </span>
            </Tooltip>
          </RibbonGroup>
        </Ribbon>
      }
      left={
        <>
          {model.template && (
            <Box sx={{ p: 2 }}>
              <Hint>{TEMPLATES.find((t) => t.id === model.template)?.description}</Hint>
            </Box>
          )}
          <PanelSection
            title="Parameters"
            action={
              <Tooltip title="Add a parameter">
                <IconButton
                  size="small"
                  aria-label="Add a parameter"
                  onClick={() =>
                    update((m) => ({ ...m, parameters: { ...m.parameters, [uniqueName('p', Object.keys(m.parameters))]: 0 } }))
                  }
                >
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            <Stack spacing={1}>
              {Object.entries(model.parameters).map(([name, value], i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label="Name"
                    value={name}
                    sx={{ width: 76 }}
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
                    width={120}
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
              <Hint>Use them in any dimension, e.g. 2*d.</Hint>
            </Stack>
          </PanelSection>
          <PanelSection title="Shapes">
            <Stack spacing={1}>
              {model.shapes.map((s, i) => (
                <Paper
                  key={i}
                  variant="outlined"
                  sx={{ p: 1, borderColor: s.name === selected ? 'error.main' : undefined }}
                  onClick={() => setSelected(s.name)}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <TextField
                        size="small"
                        label={s.kind}
                        value={s.name}
                        sx={{ flex: 1, minWidth: 0 }}
                        onChange={(e) => setShape(i, { ...s, name: e.target.value })}
                      />
                      <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Move down"
                        disabled={i === model.shapes.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Delete ${s.name}`}
                        onClick={() =>
                          update((m) => ({
                            ...m,
                            shapes: m.shapes.filter((_, k) => k !== i),
                            holes: m.holes.filter((h) => h !== s.name),
                          }))
                        }
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {s.kind === 'rectangle' && (
                        <>
                          <ExprField label="x" value={s.x} onChange={field(i, 'x')} width={104} />
                          <ExprField label="y" value={s.y} onChange={field(i, 'y')} width={104} />
                          <ExprField label="width" value={s.width} onChange={field(i, 'width')} width={104} />
                          <ExprField label="height" value={s.height} onChange={field(i, 'height')} width={104} />
                        </>
                      )}
                      {s.kind === 'circle' && (
                        <>
                          <ExprField label="cx" value={s.cx} onChange={field(i, 'cx')} width={66} />
                          <ExprField label="cy" value={s.cy} onChange={field(i, 'cy')} width={66} />
                          <ExprField label="r" value={s.r} onChange={field(i, 'r')} width={66} />
                        </>
                      )}
                      {s.kind === 'polygon' &&
                        s.points.map(([x, y], k) => (
                          <Stack key={k} direction="row" spacing={1}>
                            <ExprField
                              label={`x${k + 1}`}
                              value={x}
                              width={104}
                              onChange={(v) => setShape(i, { ...s, points: s.points.map((p, j) => (j === k ? [v, p[1]] : p)) })}
                            />
                            <ExprField
                              label={`y${k + 1}`}
                              value={y}
                              width={104}
                              onChange={(v) => setShape(i, { ...s, points: s.points.map((p, j) => (j === k ? [p[0], v] : p)) })}
                            />
                          </Stack>
                        ))}
                      {s.kind === 'polygon' && (
                        <Button
                          size="small"
                          onClick={() => setShape(i, { ...s, points: [...s.points, s.points[s.points.length - 1]] })}
                        >
                          + point
                        </Button>
                      )}
                    </Stack>
                    <Tooltip title="Hole: cut out, not meshed (e.g. the inside of an electrode)">
                      <FormControlLabel
                        label="hole"
                        sx={{ ml: 0 }}
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
                  </Stack>
                </Paper>
              ))}
              <Hint>Later shapes win where shapes overlap. Add shapes in the ribbon above.</Hint>
            </Stack>
          </PanelSection>
          {meshed && studio.mesh && (
            <PanelSection title="Domains & boundaries">
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
                  <Typography variant="body2">Domains:</Typography>
                  {progress.domains.map((d) => (
                    <Chip key={d} size="small" label={d} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
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
                <Hint>Domains take a material, boundaries a condition.</Hint>
              </Stack>
            </PanelSection>
          )}
        </>
      }
      notes={(!!notes?.length || !!error) && <StepNotes notes={notes} error={error} />}
    >
      <GeometryView
        shapes={drawn.shapes}
        bounds={drawn.bounds}
        holes={model.holes}
        selected={selected}
        onSelect={setSelected}
        height="fill"
      />
    </Workspace>
  );
}

export default GeometryTab;
