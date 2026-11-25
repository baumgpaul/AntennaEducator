/** The local mesh settings of one domain, boundary, curve or point. */
import { Checkbox, FormControlLabel, Stack, TextField, Tooltip } from '@mui/material';
import type { Expr } from '../expressions';
import type { FemModel } from '../model';
import { ExprField } from '../tabs/common';
import { controlOf, setControl } from './edit';
import type { TargetKind } from './steps';

/** A first layer a tenth of the size there (a number if the size is one) */
const layerDefault = (size: Expr): Expr => (typeof size === 'number' ? Number((size / 10).toPrecision(2)) : `(${size})/10`);

export function MeshControlFields({
  model,
  update,
  target,
  kind,
  width = 116,
}: {
  model: FemModel;
  update: (change: (m: FemModel) => FemModel) => void;
  target: string;
  kind: TargetKind;
  width?: number;
}) {
  const c = controlOf(model, target);
  const set = (key: 'size' | 'divisions' | 'grading', v: Expr) =>
    update((m) => setControl(m, target, { [key]: v === '' ? null : v }));
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
      <ExprField label="size [m]" value={c?.size ?? ''} width={width} onChange={(v) => set('size', v)} />
      {(kind === 'boundary' || kind === 'curve') && (
        <>
          <ExprField label="elements" value={c?.divisions ?? ''} width={width} onChange={(v) => set('divisions', v)} />
          {c?.divisions != null && c.divisions !== '' && (
            <Tooltip title="Last / first element length along each curve (1 = uniform)">
              <span>
                <ExprField label="grading" value={c.grading ?? 1} width={width} onChange={(v) => set('grading', v)} />
              </span>
            </Tooltip>
          )}
          <Tooltip title="Rows of thin elements along it, each thicker than the one before: resolves fields that change fast across it (e.g. charge layers). The first layer must be thinner than the elements around it, or it makes the mesh coarser there.">
            <FormControlLabel
              label="boundary layer"
              sx={{ ml: 0, width: '100%' }}
              control={
                <Checkbox
                  size="small"
                  checked={!!c?.boundary_layer}
                  onChange={(e) =>
                    update((m) =>
                      setControl(m, target, {
                        boundary_layer: e.target.checked ? { first: layerDefault(c?.size ?? m.mesh.size), growth: 1.2, layers: 5 } : null,
                      }),
                    )
                  }
                />
              }
            />
          </Tooltip>
          {c?.boundary_layer && (
            <>
              <ExprField
                label="first layer [m]"
                value={c.boundary_layer.first}
                width={width}
                onChange={(v) => update((m) => setControl(m, target, { boundary_layer: { ...c.boundary_layer!, first: v } }))}
              />
              <ExprField
                label="growth"
                value={c.boundary_layer.growth ?? 1.2}
                width={width}
                onChange={(v) => update((m) => setControl(m, target, { boundary_layer: { ...c.boundary_layer!, growth: v } }))}
              />
              <TextField
                size="small"
                type="number"
                label="layers"
                value={c.boundary_layer.layers ?? 5}
                sx={{ width }}
                slotProps={{ htmlInput: { min: 1, max: 50 } }}
                onChange={(e) =>
                  update((m) =>
                    setControl(m, target, { boundary_layer: { ...c.boundary_layer!, layers: Math.min(50, Math.max(1, Math.round(Number(e.target.value)) || 1)) } }),
                  )
                }
              />
            </>
          )}
        </>
      )}
      {kind === 'domain' && (
        <Tooltip title="A regular grid of triangles (domains with 3 or 4 sides)">
          <FormControlLabel
            label="structured"
            sx={{ ml: 0 }}
            control={
              <Checkbox
                size="small"
                checked={!!c?.structured}
                onChange={(e) => update((m) => setControl(m, target, { structured: e.target.checked }))}
              />
            }
          />
        </Tooltip>
      )}
    </Stack>
  );
}
