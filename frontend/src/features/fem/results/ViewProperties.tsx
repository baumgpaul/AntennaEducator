import { FormControlLabel, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { Hint } from '@/features/workflow/Workspace';
import { parseExprInput, type Expr } from '../expressions';
import type { FemView, StudyQuantity } from '../model';
import { StudyHint } from './StudyResultView';
import { FIELD_NAMES } from './views';

const exprText = (e: Expr) => String(e);

/** Settings of the selected result view. */
function ViewProperties({
  view,
  onChange,
  parameters = [],
}: {
  view: FemView;
  onChange: (v: FemView) => void;
  /** Names of the model's parameters (sweeps) */
  parameters?: string[];
}) {
  if (view.type === 'field') {
    return (
      <Stack spacing={2}>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={view.quantity}
          onChange={(_, q: keyof typeof FIELD_NAMES | null) => {
            if (!q) return;
            const autoNamed = view.name === FIELD_NAMES[view.quantity];
            onChange({ ...view, quantity: q, name: autoNamed ? FIELD_NAMES[q] : view.name });
          }}
        >
          <ToggleButton value="potential">V</ToggleButton>
          <ToggleButton value="E">|E|</ToggleButton>
          <ToggleButton value="D">|D|</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel
          control={<Switch size="small" checked={view.contours} onChange={(e) => onChange({ ...view, contours: e.target.checked })} />}
          label="Equipotential lines"
        />
        <FormControlLabel
          control={<Switch size="small" checked={view.arrows} onChange={(e) => onChange({ ...view, arrows: e.target.checked })} />}
          label="Field arrows"
        />
        <TextField
          select
          size="small"
          label="Colours"
          value={view.colorMap}
          onChange={(e) => onChange({ ...view, colorMap: e.target.value as typeof view.colorMap })}
        >
          {(['viridis', 'plasma', 'turbo', 'jet'] as const).map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <Hint>
          {view.quantity === 'potential'
            ? 'V is continuous and linear on each triangle. Field lines (arrows) cross the equipotential lines at right angles.'
            : 'E = −∇V is constant on each triangle (P1): fields are one order less accurate than the potential — refine where it changes fast.'}{' '}
          Pink: where the line probes sample the field.
        </Hint>
      </Stack>
    );
  }
  if (view.type === 'line') {
    const point = (which: 'start' | 'end', label: string) => (
      <Stack direction="row" spacing={1}>
        {([0, 1] as const).map((i) => (
          <TextField
            key={`${which}${i}-${exprText(view[which][i])}`}
            size="small"
            label={`${label} ${i === 0 ? 'x' : 'y'}`}
            defaultValue={exprText(view[which][i])}
            onBlur={(e) => {
              const next = [...view[which]] as [Expr, Expr];
              next[i] = parseExprInput(e.target.value);
              onChange({ ...view, [which]: next });
            }}
          />
        ))}
      </Stack>
    );
    return (
      <Stack spacing={2}>
        <ToggleButtonGroup
          size="small"
          exclusive
          fullWidth
          value={view.quantity}
          onChange={(_, q) => q && onChange({ ...view, quantity: q })}
        >
          <ToggleButton value="potential">V</ToggleButton>
          <ToggleButton value="E">|E|</ToggleButton>
        </ToggleButtonGroup>
        {point('start', 'Start')}
        {point('end', 'End')}
        <Hint>
          Use numbers in metres or expressions of the parameters, e.g. a or d/2. The line is drawn in pink on the field
          views.
        </Hint>
        <Hint>
          {view.quantity === 'potential'
            ? 'The FEM potential is piecewise linear: it follows the exact curve closely and gets closer as the mesh is refined.'
            : '|E| is constant on each element, so it jumps from triangle to triangle around the exact curve.'}
        </Hint>
      </Stack>
    );
  }
  if (view.type === 'convergence' || view.type === 'sweep') {
    // settings change the study: its saved points no longer match them
    const set = (change: Partial<typeof view>) => onChange({ ...view, ...change, run: undefined } as FemView);
    const exprField = (key: 'from' | 'to', label: string) =>
      view.type === 'sweep' && (
        <TextField
          key={`${key}-${exprText(view[key])}`}
          size="small"
          label={label}
          defaultValue={exprText(view[key])}
          onBlur={(e) => {
            const v = parseExprInput(e.target.value);
            if (v !== view[key]) set({ [key]: v });
          }}
        />
      );
    return (
      <Stack spacing={2}>
        <TextField
          select
          size="small"
          label="Quantity"
          value={view.quantity}
          onChange={(e) => set({ quantity: e.target.value as StudyQuantity })}
        >
          <MenuItem value="capacitance">Capacitance C = 2W/ΔV²</MenuItem>
          <MenuItem value="energy">Field energy W</MenuItem>
        </TextField>
        {view.type === 'sweep' && (
          <>
            <TextField
              select
              size="small"
              label="Parameter"
              value={parameters.includes(view.parameter) ? view.parameter : ''}
              onChange={(e) => set({ parameter: e.target.value, name: `Sweep ${e.target.value}` })}
            >
              {parameters.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1}>
              {exprField('from', 'From')}
              {exprField('to', 'To')}
            </Stack>
          </>
        )}
        <TextField
          select
          size="small"
          label={view.type === 'convergence' ? 'Meshes' : 'Values'}
          value={view.steps}
          onChange={(e) => set({ steps: Number(e.target.value) })}
        >
          {(view.type === 'convergence' ? [3, 4, 5, 6, 7] : [3, 4, 6, 8, 11, 16]).map((n) => (
            <MenuItem key={n} value={n}>
              {n}
              {view.type === 'convergence' && ` (finest: elements ${(2 ** ((n - 3) / 2)).toPrecision(2)}× smaller than the model's)`}
            </MenuItem>
          ))}
        </TextField>
        <StudyHint view={view} />
      </Stack>
    );
  }
  return null;
}

export default ViewProperties;
