import { useMemo, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Close, GridOn, ZoomIn } from '@mui/icons-material';
import { CollapsibleSection, Hint, Ribbon, RibbonButtons, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { colormap } from '../views/geometryDraw';
import { ExprField, StepNotes } from './common';
import { exportOnly, type MeshAlgorithm } from '../model';
import { setControl } from '../geometry/edit';
import { MeshControlFields } from '../geometry/MeshControlFields';
import type { TargetKind } from '../geometry/steps';
import { runSequence } from '../geometry/sequence';

const ALGORITHMS: { id: MeshAlgorithm; label: string; hint: string }[] = [
  { id: 'frontal-delaunay', label: 'Frontal-Delaunay (default)', hint: 'Grows well-shaped triangles from the boundary inwards: the best quality for most models.' },
  { id: 'delaunay', label: 'Delaunay', hint: 'Inserts points into a Delaunay triangulation: fast and robust, slightly less regular.' },
  { id: 'meshadapt', label: 'MeshAdapt', hint: 'Local edge swaps and splits: robust for complicated or strongly graded geometries.' },
];

type ColorBy = 'domain' | 'quality' | 'min_angle' | 'aspect';
const MEASURES: { id: ColorBy; label: string }[] = [
  { id: 'domain', label: 'Domains' },
  { id: 'quality', label: 'Quality' },
  { id: 'min_angle', label: 'Smallest angle' },
  { id: 'aspect', label: 'Aspect ratio' },
];
/** Elements below this shape quality are flagged */
const POOR = 0.3;

function MeshTab({ studio }: { studio: FemStudio }) {
  const { model, update, progress, busy, error } = studio;
  const [colorBy, setColorBy] = useState<ColorBy>('domain');
  const [showPoor, setShowPoor] = useState(false);
  const [focus, setFocus] = useState<{ k: number } | null>(null);
  const mesh = studio.mesh?.data;
  const onlyExport = exportOnly(model);
  // poor elements, worst first
  const poor = useMemo(() => {
    if (!mesh) return [];
    return mesh.quality
      .map((q, e) => [q, e] as const)
      .filter(([q]) => q < POOR)
      .sort((a, b) => a[0] - b[0])
      .map(([, e]) => e);
  }, [mesh]);
  const values = mesh && colorBy !== 'domain' ? (colorBy === 'quality' ? mesh.quality : colorBy === 'min_angle' ? mesh.min_angle : mesh.aspect) : undefined;
  const current = progress.done.has('mesh');
  const setMesh = (change: Partial<typeof model.mesh>) => update((m) => ({ ...m, mesh: { ...m.mesh, ...change } }));
  const notes = progress.notes.mesh;
  const seq = runSequence(model);
  // what can be refined: domains and boundaries (known once meshed), curve and point objects
  const targets: { name: string; kind: TargetKind }[] = [
    ...progress.domains.map((name) => ({ name, kind: 'domain' as const })),
    ...seq.objects.filter((o) => o.dim < 2).map((o) => ({ name: o.name, kind: o.dim === 1 ? ('curve' as const) : ('point' as const) })),
    // boundaries, without the lines listed above (a hole's edge is a boundary named like the hole)
    ...progress.boundaries.filter((b) => !seq.objects.some((o) => o.name === b && o.dim < 2)).map((name) => ({ name, kind: 'boundary' as const })),
  ];
  const kindOf = (name: string): TargetKind => targets.find((t) => t.name === name)?.kind ?? (seq.domains.includes(name) ? 'domain' : 'boundary');

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Mesh">
            <RibbonButtons>
              <Button
                startIcon={<GridOn />}
                onClick={studio.runMesh}
                disabled={busy !== null || !progress.done.has('physics') || progress.attention.has('mesh')}
              >
                {busy === 'mesh' ? 'Meshing…' : current ? 'Mesh is up to date' : 'Generate mesh'}
              </Button>
            </RibbonButtons>
          </RibbonGroup>
          <RibbonGroup label="Colour by">
            <ToggleButtonGroup size="small" exclusive value={colorBy} onChange={(_, v) => v && setColorBy(v)}>
              {MEASURES.map((m) => (
                <ToggleButton key={m.id} value={m.id} disabled={m.id !== 'domain' && m.id !== 'quality' && !mesh?.[m.id as 'min_angle' | 'aspect']}>
                  {m.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </RibbonGroup>
          {mesh && (
            <RibbonGroup label={`Poor elements (q < ${POOR})`}>
              <FormControlLabel
                sx={{ ml: 0 }}
                label={poor.length.toLocaleString()}
                control={<Switch size="small" checked={showPoor} onChange={(e) => setShowPoor(e.target.checked)} disabled={!poor.length} />}
              />
              <Button
                size="small"
                startIcon={<ZoomIn />}
                disabled={!poor.length && !mesh.quality.length}
                onClick={() => setFocus((f) => ({ k: f ? (f.k + 1) % Math.max(1, poor.length) : 0 }))}
              >
                Show worst
              </Button>
            </RibbonGroup>
          )}
          {mesh && (
            <RibbonGroup label="Size">
              <Typography variant="body2">
                {mesh.stats.nodes.toLocaleString()} nodes{onlyExport ? '' : ' (unknowns)'} · {mesh.stats.triangles.toLocaleString()} triangles
                {mesh.stats.quads ? ` · ${mesh.stats.quads.toLocaleString()} quadrilaterals` : ''}
                {!current && ' · out of date: generate again'}
              </Typography>
            </RibbonGroup>
          )}
        </Ribbon>
      }
      left={
        <>
          <CollapsibleSection title="Elements">
            <Stack spacing={1.5}>
              <ToggleButtonGroup size="small" exclusive fullWidth value={model.mesh.element ?? 'triangle'} onChange={(_, v) => v && setMesh({ element: v })}>
                <ToggleButton value="triangle">Triangles</ToggleButton>
                <ToggleButton value="quad">Quadrilaterals</ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup size="small" exclusive fullWidth value={model.mesh.order} onChange={(_, v) => v && setMesh({ order: v })}>
                <ToggleButton value={1}>Linear (order 1)</ToggleButton>
                <ToggleButton value={2}>Quadratic (2)</ToggleButton>
              </ToggleButtonGroup>
              {onlyExport ? (
                <Alert severity="info">
                  {onlyExport}: <b>export only</b>. The built-in solver uses linear triangles (P1); export the model to
                  openCFS, which solves these meshes.
                </Alert>
              ) : (
                <Hint>Linear triangles: what the built-in P1 solver uses. Quadrilaterals and order 2 are for export to openCFS.</Hint>
              )}
            </Stack>
          </CollapsibleSection>
          <CollapsibleSection title="Element size">
            <Stack spacing={2}>
              <ExprField label="max size [m]" value={model.mesh.size} width={248} onChange={(v) => setMesh({ size: v })} />
              <ExprField
                label="min size [m] (optional)"
                value={model.mesh.min_size ?? ''}
                width={248}
                onChange={(v) => setMesh({ min_size: v === '' ? null : v })}
              />
              <TextField
                size="small"
                type="number"
                label="elements per full circle"
                value={model.mesh.elements_per_circle}
                sx={{ width: 248 }}
                onChange={(e) => setMesh({ elements_per_circle: Math.max(4, Math.round(Number(e.target.value))) })}
              />
            </Stack>
          </CollapsibleSection>
          <CollapsibleSection title="Algorithm" defaultExpanded={false}>
            <Stack spacing={2}>
              <TextField
                select
                size="small"
                label="triangulation"
                value={model.mesh.algorithm ?? 'frontal-delaunay'}
                sx={{ width: 248 }}
                onChange={(e) => setMesh({ algorithm: e.target.value as MeshAlgorithm })}
              >
                {ALGORITHMS.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="number"
                label="smoothing passes"
                value={model.mesh.smoothing ?? 1}
                sx={{ width: 248 }}
                onChange={(e) => setMesh({ smoothing: Math.min(100, Math.max(0, Math.round(Number(e.target.value)))) })}
              />
              <Hint>{ALGORITHMS.find((a) => a.id === (model.mesh.algorithm ?? 'frontal-delaunay'))?.hint}</Hint>
            </Stack>
          </CollapsibleSection>
          <CollapsibleSection title="Local refinement">
            <Stack spacing={1.5}>
              {model.mesh.controls.map((c) => (
                <Stack key={c.target} spacing={1}>
                  <Stack direction="row" sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }} noWrap title={c.target}>
                      {c.target}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${c.target}`}
                      onClick={() => update((m) => setControl(m, c.target, null))}
                    >
                      <Close fontSize="small" />
                    </IconButton>
                  </Stack>
                  <MeshControlFields model={model} update={update} target={c.target} kind={kindOf(c.target)} />
                </Stack>
              ))}
              <TextField
                select
                size="small"
                label="Refine at…"
                value=""
                onChange={(e) => update((m) => setControl(m, e.target.value, { size: m.mesh.size }))}
              >
                {targets
                  .filter((t) => !model.mesh.controls.some((c) => c.target === t.name))
                  .map((t) => (
                    <MenuItem key={t.name} value={t.name}>
                      {t.name} ({t.kind})
                    </MenuItem>
                  ))}
              </TextField>
              <Hint>Finer where the field changes fast: edges, thin gaps, sharp corners. Each element of the geometry tree can also be set in its properties.</Hint>
            </Stack>
          </CollapsibleSection>
          {mesh && (
            <CollapsibleSection title="Element quality">
              <QualityHistogram histogram={mesh.stats.quality.histogram} min={mesh.stats.quality.min} />
              {mesh.stats.angles && mesh.stats.aspect && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  angles {mesh.stats.angles.min.toFixed(1)}° … {mesh.stats.angles.max.toFixed(1)}° · aspect ratio mean{' '}
                  {mesh.stats.aspect.mean.toFixed(2)}, max {mesh.stats.aspect.max.toPrecision(3)}
                </Typography>
              )}
              <Hint>
                Quality: 4√3·A/Σl² for triangles (1 = equilateral), the smallest sine of the corner angles for quadrilaterals
                (1 = rectangle). Flat elements (q → 0), very small or very large angles spoil the accuracy; long thin
                elements are fine only where the field hardly changes along them (boundary layers).
              </Hint>
            </CollapsibleSection>
          )}
        </>
      }
      notes={(!!notes?.length || !!error) && <StepNotes notes={notes} error={error} />}
    >
      {mesh ? (
        <MeshView
          mesh={mesh}
          elementValues={values}
          highlightElements={showPoor ? poor : undefined}
          focusElement={focus ? (poor.length ? poor[focus.k % poor.length] : mesh.quality.indexOf(Math.min(...mesh.quality))) : null}
          height="fill"
        />
      ) : (
        <Typography
          sx={{
            color: "text.secondary",
            p: 3
          }}>
          Generate the mesh to see it here.
        </Typography>
      )}
    </Workspace>
  );
}

function QualityHistogram({ histogram, min }: { histogram: number[]; min: number }) {
  const max = Math.max(...histogram, 1);
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" sx={{
        color: "text.secondary"
      }}>
        worst {min.toFixed(2)}
      </Typography>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: "flex-end",
          height: 60
        }}>
        {histogram.map((n, i) => (
          <Box
            key={i}
            title={`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${n}`}
            sx={{ flex: 1, height: `${(100 * n) / max}%`, minHeight: n ? 2 : 0, bgcolor: colormap((i + 0.5) / 10) }}
          />
        ))}
      </Stack>
      <Stack direction="row" sx={{
        justifyContent: "space-between"
      }}>
        <Typography variant="caption">0 (flat)</Typography>
        <Typography variant="caption">1 (equilateral)</Typography>
      </Stack>
    </Box>
  );
}

export default MeshTab;
