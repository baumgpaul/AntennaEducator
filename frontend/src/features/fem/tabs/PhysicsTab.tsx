import { useState } from 'react';
import { MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Hint, PanelSection, Ribbon, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import type { BoundaryCondition } from '../model';
import type { FemStudio } from '../useFemStudio';
import MeshView from '../views/MeshView';
import { ExprField, StepNotes } from './common';

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
  const notes = progress.notes.physics;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Equation">
            <Typography variant="body2">
              −∇·(ε∇V) = ρ with V (Dirichlet) or D·n (Neumann) on every boundary — fix at least one potential.
            </Typography>
          </RibbonGroup>
          <RibbonGroup label="2D plane: depth along z">
            <TextField
              size="small"
              type="number"
              label="depth [m]"
              value={model.depth}
              sx={{ width: 120 }}
              onChange={(e) => update((m) => ({ ...m, depth: Math.max(Number(e.target.value), 1e-9) }))}
            />
            <Hint>1 m: results per metre</Hint>
          </RibbonGroup>
        </Ribbon>
      }
      left={
        <>
          <PanelSection title="Boundary conditions">
            <Stack spacing={1}>
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
                    <Stack spacing={1}>
                      <Typography variant="body2" noWrap title={b} sx={{ fontWeight: 500 }}>
                        {b}
                      </Typography>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          select
                          size="small"
                          sx={{ flex: 1, minWidth: 0 }}
                          value={type}
                          inputProps={{ 'aria-label': `Condition on ${b}` }}
                          onChange={(e) => {
                            const t = e.target.value as BoundaryCondition['type'] | 'none';
                            if (t === 'none') setCondition(b, null);
                            else if (t === 'ground') setCondition(b, { type: t, boundary: b });
                            else
                              setCondition(b, {
                                type: t,
                                boundary: b,
                                value: 'value' in (bc ?? {}) ? (bc as { value: number }).value : t === 'potential' ? 1 : 1e-6,
                              });
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
                            width={84}
                            onChange={(v) => setCondition(b, { ...bc, value: v })}
                          />
                        )}
                      </Stack>
                      {focus === b && <Hint>{TYPES.find((t) => t.value === type)?.explain}</Hint>}
                    </Stack>
                  </Paper>
                );
              })}
              <Hint>Hover a boundary to see where it is (red).</Hint>
            </Stack>
          </PanelSection>
          <PanelSection title="Volume charge ρ [C/m³]">
            <Stack spacing={1}>
              {progress.domains.map((d) => {
                const src = sourceOf(d);
                return (
                  <Stack key={d} direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ width: 100 }} noWrap title={d}>
                      {d}
                    </Typography>
                    <ExprField
                      label="ρ"
                      value={src?.value ?? 0}
                      width={130}
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
              <Hint>Optional: free charge inside a domain.</Hint>
            </Stack>
          </PanelSection>
        </>
      }
      notes={!!notes?.length && <StepNotes notes={notes} />}
    >
      {mesh ? (
        <MeshView mesh={mesh} showEdges={false} highlightBoundaries={focus ? [focus] : []} height="fill" />
      ) : (
        <Typography color="text.secondary" sx={{ p: 3 }}>
          Find the domains and boundaries on the Geometry tab first.
        </Typography>
      )}
    </Workspace>
  );
}

export default PhysicsTab;
