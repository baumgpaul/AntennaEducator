/** The local mesh settings of one domain, boundary, curve or point. */
import { Checkbox, FormControlLabel, Stack, Tooltip } from '@mui/material';
import type { Expr } from '../expressions';
import type { FemModel } from '../model';
import { ExprField } from '../tabs/common';
import { controlOf, setControl } from './edit';
import type { TargetKind } from './steps';

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
