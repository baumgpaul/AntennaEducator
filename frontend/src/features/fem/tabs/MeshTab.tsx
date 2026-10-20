import { useState } from 'react';
import { Box, Button, IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Close, GridOn } from '@mui/icons-material';
import { Hint, PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { colormap } from '../views/geometryDraw';
import { ExprField, StepNotes } from './common';

function MeshTab({ studio }: { studio: FemStudio }) {
  const { model, update, progress, busy, error } = studio;
  const [colorBy, setColorBy] = useState<'domain' | 'quality'>('domain');
  const [addBoundary, setAddBoundary] = useState('');
  const mesh = studio.mesh?.data;
  const current = progress.done.has('mesh');
  const setMesh = (change: Partial<typeof model.mesh>) => update((m) => ({ ...m, mesh: { ...m.mesh, ...change } }));
  const notes = progress.notes.mesh;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Mesh">
            <Button
              variant="contained"
              size="small"
              startIcon={<GridOn />}
              onClick={studio.runMesh}
              disabled={busy !== null || !progress.done.has('physics') || progress.attention.has('mesh')}
            >
              {busy === 'mesh' ? 'Meshing…' : current ? 'Mesh is up to date' : 'Generate mesh'}
            </Button>
          </RibbonGroup>
          <RibbonGroup label="Colour by">
            <ToggleButtonGroup size="small" exclusive value={colorBy} onChange={(_, v) => v && setColorBy(v)}>
              <ToggleButton value="domain">Domains</ToggleButton>
              <ToggleButton value="quality">Element quality</ToggleButton>
            </ToggleButtonGroup>
          </RibbonGroup>
          {mesh && (
            <RibbonGroup label="Size">
              <Typography variant="body2">
                {mesh.stats.nodes.toLocaleString()} nodes (unknowns) · {mesh.stats.triangles.toLocaleString()} triangles
                {!current && ' · out of date: generate again'}
              </Typography>
            </RibbonGroup>
          )}
        </Ribbon>
      }
      left={
        <>
          <PanelSection title="Element size">
            <Stack spacing={2}>
              <ExprField label="max size [m]" value={model.mesh.size} width={248} onChange={(v) => setMesh({ size: v })} />
              <TextField
                size="small"
                type="number"
                label="elements per full circle"
                value={model.mesh.elements_per_circle}
                sx={{ width: 248 }}
                onChange={(e) => setMesh({ elements_per_circle: Math.max(4, Math.round(Number(e.target.value))) })}
              />
            </Stack>
          </PanelSection>
          <PanelSection title="Finer along a boundary">
            <Stack spacing={1}>
              {Object.entries(model.mesh.boundary_sizes).map(([b, v]) => (
                <Stack key={b} direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ width: 80 }} noWrap title={b}>
                    {b}
                  </Typography>
                  <ExprField
                    label="size [m]"
                    value={v}
                    width={120}
                    onChange={(x) => setMesh({ boundary_sizes: { ...model.mesh.boundary_sizes, [b]: x } })}
                  />
                  <IconButton
                    size="small"
                    aria-label={`Remove ${b}`}
                    onClick={() => {
                      const s = { ...model.mesh.boundary_sizes };
                      delete s[b];
                      setMesh({ boundary_sizes: s });
                    }}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <TextField
                select
                size="small"
                label="Add a boundary"
                value={addBoundary}
                onChange={(e) => {
                  setAddBoundary('');
                  setMesh({ boundary_sizes: { ...model.mesh.boundary_sizes, [e.target.value]: model.mesh.size } });
                }}
              >
                {progress.boundaries
                  .filter((b) => !(b in model.mesh.boundary_sizes))
                  .map((b) => (
                    <MenuItem key={b} value={b}>
                      {b}
                    </MenuItem>
                  ))}
              </TextField>
              <Hint>Where the field changes fast (edges, thin gaps).</Hint>
            </Stack>
          </PanelSection>
          <PanelSection title="Finer inside a domain">
            <Stack spacing={1.5}>
              {progress.domains.map((d) => (
                <ExprField
                  key={d}
                  label={`${d} [m]`}
                  value={model.mesh.domain_sizes[d] ?? ''}
                  width={248}
                  onChange={(v) => {
                    const s = { ...model.mesh.domain_sizes };
                    if (v === '') delete s[d];
                    else s[d] = v;
                    setMesh({ domain_sizes: s });
                  }}
                />
              ))}
            </Stack>
          </PanelSection>
          {mesh && (
            <PanelSection title="Element quality">
              <QualityHistogram histogram={mesh.stats.quality.histogram} min={mesh.stats.quality.min} />
              <Hint>
                The solution is linear on each triangle; its values at the {mesh.stats.nodes.toLocaleString()} nodes are the
                unknowns. Quality q = 4√3·A/Σl² is 1 for an equilateral triangle; flat ones (q → 0) spoil the accuracy.
              </Hint>
            </PanelSection>
          )}
        </>
      }
      notes={(!!notes?.length || !!error) && <StepNotes notes={notes} error={error} />}
    >
      {mesh ? (
        <MeshView mesh={mesh} triangleValues={colorBy === 'quality' ? mesh.quality : undefined} height="fill" />
      ) : (
        <Typography color="text.secondary" sx={{ p: 3 }}>
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
      <Typography variant="caption" color="text.secondary">
        worst {min.toFixed(2)}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="flex-end" sx={{ height: 60 }}>
        {histogram.map((n, i) => (
          <Box
            key={i}
            title={`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${n}`}
            sx={{ flex: 1, height: `${(100 * n) / max}%`, minHeight: n ? 2 : 0, bgcolor: colormap((i + 0.5) / 10) }}
          />
        ))}
      </Stack>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="caption">0 (flat)</Typography>
        <Typography variant="caption">1 (equilateral)</Typography>
      </Stack>
    </Box>
  );
}

export default MeshTab;
