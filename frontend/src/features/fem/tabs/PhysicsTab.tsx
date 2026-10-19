import { useState } from 'react';
import { Alert, Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import type { BoundaryCondition } from '../model';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { ExprField, Section, StepNotes } from './common';

const TYPES: { value: BoundaryCondition['type'] | 'none'; label: string; explain: string }[] = [
  { value: 'none', label: 'None (natural: D·n = 0)', explain: 'No input needed: FEM imposes zero normal flux on any boundary you leave untouched — a symmetry line, or the far edge of an air box.' },
  { value: 'ground', label: 'Ground (V = 0)', explain: 'Dirichlet condition: the potential is fixed to 0 V, e.g. a grounded electrode.' },
  { value: 'potential', label: 'Potential (V = V₀)', explain: 'Dirichlet condition: the potential is fixed. May depend on x and y, e.g. "E0*x".' },
  { value: 'surface_charge_density', label: 'Surface charge (−D·n = σ)', explain: 'Neumann condition: a charged sheet on the boundary [C/m²]; field lines start there and go into the domain.' },
];

function PhysicsTab({ studio }: { studio: FemStudio }) {
  const { model, update, progress } = studio;
  const [focus, setFocus] = useState<string | null>(null);
  const mesh = studio.mesh?.data;

  const conditionOf = (b: string) => model.boundary_conditions.find((bc) => bc.boundary === b);
  const setCondition = (b: string, bc: BoundaryCondition | null) =>
    update((m) => ({
      ...m,
      boundary_conditions: [...m.boundary_conditions.filter((x) => x.boundary !== b), ...(bc ? [bc] : [])],
    }));
  const sourceOf = (d: string) => model.sources.find((s) => s.domain === d);

  return (
    <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
      <Paper variant="outlined" sx={{ width: 420, p: 2, overflow: 'auto' }}>
        <Stack spacing={2}>
          <Alert severity="info" icon={false}>
            <Typography variant="body2">
              <b>−∇·(ε∇V) = ρ</b> with a condition on every boundary: either V (Dirichlet) or the normal flux D·n (Neumann).
              At least one potential must be fixed — only differences of V are physical.
            </Typography>
          </Alert>
          <Section title="Boundary conditions">
            {progress.boundaries.map((b) => {
              const bc = conditionOf(b);
              const type = bc?.type ?? 'none';
              return (
                <Paper
                  key={b}
                  variant="outlined"
                  sx={{ p: 1, borderColor: focus === b ? 'error.main' : undefined }}
                  onMouseEnter={() => setFocus(b)}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography sx={{ width: 110 }} noWrap title={b}>
                      {b}
                    </Typography>
                    <TextField
                      select
                      size="small"
                      sx={{ flex: 1 }}
                      value={type}
                      onChange={(e) => {
                        const t = e.target.value as BoundaryCondition['type'] | 'none';
                        if (t === 'none') setCondition(b, null);
                        else if (t === 'ground') setCondition(b, { type: t, boundary: b });
                        else setCondition(b, { type: t, boundary: b, value: 'value' in (bc ?? {}) ? (bc as { value: number }).value : t === 'potential' ? 1 : 1e-6 });
                      }}
                    >
                      {TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          {t.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {bc && 'value' in bc && (
                      <ExprField
                        label={bc.type === 'potential' ? 'V [V]' : 'σ [C/m²]'}
                        value={bc.value}
                        width={100}
                        onChange={(v) => setCondition(b, { ...bc, value: v })}
                      />
                    )}
                  </Stack>
                  {focus === b && (
                    <Typography variant="caption" color="text.secondary">
                      {TYPES.find((t) => t.value === type)?.explain}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Section>
          <Section title="Volume charge ρ [C/m³] (optional)">
            {progress.domains.map((d) => {
              const src = sourceOf(d);
              return (
                <Stack key={d} direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ width: 110 }} noWrap>
                    {d}
                  </Typography>
                  <ExprField
                    label="ρ"
                    value={src?.value ?? 0}
                    width={140}
                    onChange={(v) =>
                      update((m) => ({
                        ...m,
                        sources: [
                          ...m.sources.filter((s) => s.domain !== d),
                          ...(v === 0 || v === '' ? [] : [{ type: 'charge_density' as const, domain: d, value: v }]),
                        ],
                      }))
                    }
                  />
                </Stack>
              );
            })}
          </Section>
          <Section title="2D plane: depth along z">
            <TextField
              size="small"
              type="number"
              label="depth [m]"
              value={model.depth}
              sx={{ width: 140 }}
              helperText="1 m gives results per metre (F/m)"
              onChange={(e) => update((m) => ({ ...m, depth: Math.max(Number(e.target.value), 1e-9) }))}
            />
          </Section>
        </Stack>
      </Paper>
      <Paper variant="outlined" sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <StepNotes notes={progress.notes.physics} />
        {mesh ? (
          <MeshView mesh={mesh} showEdges={false} highlightBoundaries={focus ? [focus] : []} />
        ) : (
          <Typography color="text.secondary">Find the domains and boundaries on the Geometry tab first.</Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          Hover a boundary on the left to see where it is (red).
        </Typography>
      </Paper>
    </Box>
  );
}

export default PhysicsTab;
