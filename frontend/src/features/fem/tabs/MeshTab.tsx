import { useState } from 'react';
import { Box, Button, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { colormap } from '../views/geometryDraw';
import { ExprField, Section, StepNotes } from './common';

function MeshTab({ studio }: { studio: FemStudio }) {
  const { model, update, progress, busy, error } = studio;
  const [colorBy, setColorBy] = useState<'domain' | 'quality'>('domain');
  const [addBoundary, setAddBoundary] = useState('');
  const mesh = studio.mesh?.data;
  const current = progress.done.has('mesh');
  const setMesh = (change: Partial<typeof model.mesh>) => update((m) => ({ ...m, mesh: { ...m.mesh, ...change } }));

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ width: 380, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          <Section title="Element size">
            <ExprField label="max size [m]" value={model.mesh.size} width={160} onChange={(v) => setMesh({ size: v })} />
            <TextField
              size="small"
              type="number"
              label="elements per full circle"
              value={model.mesh.elements_per_circle}
              sx={{ width: 200 }}
              onChange={(e) => setMesh({ elements_per_circle: Math.max(4, Math.round(Number(e.target.value))) })}
            />
          </Section>
          <Section title="Finer along a boundary (field changes fast there)">
            {Object.entries(model.mesh.boundary_sizes).map(([b, v]) => (
              <Stack key={b} direction="row" spacing={1} alignItems="center">
                <Typography sx={{ width: 110 }} noWrap>
                  {b}
                </Typography>
                <ExprField label="size [m]" value={v} onChange={(x) => setMesh({ boundary_sizes: { ...model.mesh.boundary_sizes, [b]: x } })} />
                <Button
                  size="small"
                  onClick={() => {
                    const s = { ...model.mesh.boundary_sizes };
                    delete s[b];
                    setMesh({ boundary_sizes: s });
                  }}
                >
                  remove
                </Button>
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
          </Section>
          <Section title="Finer inside a domain">
            {progress.domains.map((d) => (
              <ExprField
                key={d}
                label={`${d} [m]`}
                value={model.mesh.domain_sizes[d] ?? ''}
                width={200}
                onChange={(v) => {
                  const s = { ...model.mesh.domain_sizes };
                  if (v === '') delete s[d];
                  else s[d] = v;
                  setMesh({ domain_sizes: s });
                }}
              />
            ))}
          </Section>
          <Button variant="contained" onClick={studio.runMesh} disabled={busy !== null || !progress.done.has('physics') || progress.attention.has('mesh')}>
            {busy === 'mesh' ? 'Meshing…' : current ? 'Mesh is up to date' : 'Generate mesh'}
          </Button>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <StepNotes notes={progress.notes.mesh} error={error} />
        {mesh && (
          <>
            <Stack direction="row" spacing={2} alignItems="center">
              <ToggleButtonGroup size="small" exclusive value={colorBy} onChange={(_, v) => v && setColorBy(v)}>
                <ToggleButton value="domain">Domains</ToggleButton>
                <ToggleButton value="quality">Element quality</ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="body2" color="text.secondary">
                {mesh.stats.nodes.toLocaleString()} nodes (unknowns) · {mesh.stats.triangles.toLocaleString()} triangles
                {!current && ' · out of date: generate again'}
              </Typography>
            </Stack>
            <MeshView mesh={mesh} triangleValues={colorBy === 'quality' ? mesh.quality : undefined} />
            <QualityHistogram histogram={mesh.stats.quality.histogram} min={mesh.stats.quality.min} />
          </>
        )}
        <Typography variant="body2" color="text.secondary">
          The solution is linear on each triangle; its values at the {mesh ? mesh.stats.nodes.toLocaleString() : ''} nodes are
          the unknowns. Quality q = 4√3·A/Σl² is 1 for an equilateral triangle; flat ones (q → 0) spoil the accuracy.
        </Typography>
      </Paper>
    </Box>
  );
}

function QualityHistogram({ histogram, min }: { histogram: number[]; min: number }) {
  const max = Math.max(...histogram, 1);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Element quality (worst {min.toFixed(2)})
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
