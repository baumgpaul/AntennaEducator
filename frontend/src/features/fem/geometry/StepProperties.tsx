/**
 * Properties of the selected geometry step (or named boundary): its fields,
 * generated from the step catalogue, its role (domain/hole) and its mesh.
 */
import { Alert, Autocomplete, Box, Button, Checkbox, Chip, Divider, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward, Close, Delete } from '@mui/icons-material';
import { Hint } from '@/features/workflow/Workspace';
import type { Expr } from '../expressions';
import type { FemModel, Point2, Selection, Step } from '../model';
import { ExprField } from '../tabs/common';
import { deleteObjects, moveStep, renameObject, replaceStep, toggleHole } from './edit';
import { MeshControlFields } from './MeshControlFields';
import type { Sequence } from './sequence';
import { SELECTION_LABEL, STEPS, TARGET_HINT, type FieldSpec, type TargetKind } from './steps';

type Update = (change: (m: FemModel) => FemModel) => void;

function PointsField({ points, min, onChange }: { points: Point2[]; min: number; onChange: (p: Point2[]) => void }) {
  return (
    <Stack spacing={1}>
      {points.map(([x, y], k) => (
        <Stack key={k} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ExprField label={`x${k + 1}`} value={x} width={104} onChange={(v) => onChange(points.map((p, j) => (j === k ? [v, p[1]] : p)))} />
          <ExprField label={`y${k + 1}`} value={y} width={104} onChange={(v) => onChange(points.map((p, j) => (j === k ? [p[0], v] : p)))} />
          <IconButton size="small" aria-label={`Remove point ${k + 1}`} disabled={points.length <= min} onClick={() => onChange(points.filter((_, j) => j !== k))}>
            <Close fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => onChange([...points, points[points.length - 1] ?? [0, 0]])}>
        + point
      </Button>
    </Stack>
  );
}

function NamesField({ label, value, options, onChange }: { label: string; value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  return (
    <Autocomplete
      multiple
      size="small"
      options={options.filter((o) => !value.includes(o))}
      value={value}
      onChange={(_, v) => onChange(v)}
      renderValue={(v, getItemProps) => v.map((n, i) => <Chip size="small" label={n} {...getItemProps({ index: i })} key={n} />)}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

function Field({ spec, step, options, onChange }: { spec: FieldSpec; step: Step; options: string[]; onChange: (key: string, v: unknown) => void }) {
  const value = (step as unknown as Record<string, unknown>)[spec.key];
  switch (spec.type) {
    case 'expr':
      return (
        <ExprField
          label={`${spec.label}${spec.unit ? ` [${spec.unit}]` : ''}`}
          value={(value as Expr | undefined) ?? ''}
          width={120}
          onChange={(v) => onChange(spec.key, v === '' && spec.optional ? undefined : v)}
        />
      );
    case 'count':
      return (
        <TextField
          size="small"
          type="number"
          label={spec.label}
          value={value as number}
          sx={{ width: 120 }}
          slotProps={{ htmlInput: { min: spec.min, max: spec.max } }}
          onChange={(e) => onChange(spec.key, Math.min(spec.max, Math.max(spec.min, Math.round(Number(e.target.value)) || spec.min)))}
        />
      );
    case 'bool':
      return (
        <Tooltip title={spec.help}>
          <FormControlLabel
            label={spec.label}
            sx={{ ml: 0 }}
            control={<Checkbox size="small" checked={!!value} onChange={(e) => onChange(spec.key, e.target.checked)} />}
          />
        </Tooltip>
      );
    case 'points':
      return <PointsField points={value as Point2[]} min={spec.min} onChange={(p) => onChange(spec.key, p)} />;
    case 'objects':
      return <NamesField label={spec.label} value={value as string[]} options={options} onChange={(v) => onChange(spec.key, v)} />;
  }
}

/** The step at `index`, editable. */
export function StepProperties({
  model,
  update,
  seq,
  index,
  onRenamed,
  onDeleted,
}: {
  model: FemModel;
  update: Update;
  seq: Sequence;
  index: number;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}) {
  const step = model.steps[index];
  const info = STEPS[step.kind];
  const before = seq.aliveBefore[index] ?? {};
  const object = seq.objects.find((o) => o.name === step.name);
  const isHole = model.holes.includes(step.name);
  const set = (key: string, v: unknown) =>
    update((m) => {
      const s = { ...m.steps[index] } as Record<string, unknown>;
      if (v === undefined) delete s[key];
      else s[key] = v;
      return replaceStep(m, index, s as unknown as Step);
    });
  const meshKind: TargetKind | null = !object ? null : object.dim === 2 ? (isHole ? 'boundary' : 'domain') : object.dim === 1 ? 'curve' : 'point';

  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        label="Name"
        value={step.name}
        onChange={(e) => {
          const name = e.target.value;
          update((m) => renameObject(m, m.steps[index].name, name));
          onRenamed(name);
        }}
        helperText={object && object.dim === 2 && !isHole ? 'The domain takes this name' : undefined}
      />
      <Hint>{info.help}</Hint>
      {seq.stepErrors[step.name] && <Alert severity="error">{seq.stepErrors[step.name]}</Alert>}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {info.fields.map((spec) => {
          const options = spec.type === 'objects' ? Object.entries(before).filter(([, d]) => spec.dims.includes(d)).map(([n]) => n) : [];
          const wide = spec.type === 'points' || spec.type === 'objects';
          return (
            <Box key={spec.key} sx={wide ? { width: '100%' } : undefined}>
              <Field spec={spec} step={step} options={options} onChange={set} />
            </Box>
          );
        })}
      </Stack>

      {object && object.dim === 2 && (
        <Tooltip title="Cut out and not meshed (e.g. the inside of an electrode); its edge becomes a boundary with its name">
          <FormControlLabel
            label="hole"
            sx={{ ml: 0 }}
            control={<Checkbox size="small" checked={isHole} onChange={(e) => update((m) => toggleHole(m, step.name, e.target.checked))} />}
          />
        </Tooltip>
      )}
      {meshKind && (
        <>
          <Divider />
          <Typography variant="subtitle2">Mesh {meshKind === 'boundary' ? 'along its edge' : meshKind === 'domain' ? 'inside' : 'here'}</Typography>
          <MeshControlFields model={model} update={update} target={step.name} kind={meshKind} />
          <Hint>{TARGET_HINT[meshKind]}</Hint>
        </>
      )}
      {!object && !seq.stepErrors[step.name] && (
        <Hint>{info.dim === null && !('keep' in step && step.keep) ? 'Changes its objects in place.' : 'Used by a later step: it is part of that object now.'}</Hint>
      )}

      <Divider />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Tooltip title="Earlier in the sequence (drawn below later objects)">
          <span>
            <IconButton size="small" aria-label="Earlier" disabled={index === 0} onClick={() => update((m) => moveStep(m, index, -1))}>
              <ArrowUpward fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Later in the sequence (wins where objects overlap)">
          <span>
            <IconButton size="small" aria-label="Later" disabled={index === model.steps.length - 1} onClick={() => update((m) => moveStep(m, index, 1))}>
              <ArrowDownward fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          color="error"
          startIcon={<Delete />}
          onClick={() => {
            update((m) => deleteObjects(m, [step.name], seq.objects.map((o) => o.name)));
            onDeleted();
          }}
        >
          Delete
        </Button>
      </Stack>
      {info.group === 'combine' && consumedHint(step)}
    </Stack>
  );
}

const consumedHint = (step: Step) =>
  'keep' in step && step.keep ? null : <Hint>Deleting it brings its inputs back as separate objects.</Hint>;

/** A named boundary, editable. */
export function SelectionProperties({
  model,
  update,
  seq,
  index,
  onRenamed,
  onDeleted,
}: {
  model: FemModel;
  update: Update;
  seq: Sequence;
  index: number;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
}) {
  const sel = model.selections[index];
  const set = (s: Selection) => update((m) => ({ ...m, selections: m.selections.map((x, i) => (i === index ? s : x)) }));
  return (
    <Stack spacing={2}>
      <TextField
        size="small"
        label="Name"
        value={sel.name}
        onChange={(e) => {
          const name = e.target.value;
          update((m) => renameObject(m, m.selections[index].name, name));
          onRenamed(name);
        }}
        helperText={SELECTION_LABEL[sel.kind]}
      />
      {sel.kind === 'box' && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {(['xmin', 'ymin', 'xmax', 'ymax'] as const).map((k) => (
            <ExprField key={k} label={`${k} [m]`} value={sel[k]} width={120} onChange={(v) => set({ ...sel, [k]: v })} />
          ))}
        </Stack>
      )}
      {sel.kind === 'points' && <PointsField points={sel.points} min={1} onChange={(points) => set({ ...sel, points })} />}
      {sel.kind === 'boundary_of' && (
        <NamesField label="domains" value={sel.domains} options={seq.domains} onChange={(domains) => set({ ...sel, domains })} />
      )}
      <Hint>
        {sel.kind === 'box'
          ? 'Every edge lying completely inside the box.'
          : sel.kind === 'points'
            ? 'The edge nearest to each point (within 2 % of the model size).'
            : 'All edges around these domains.'}
      </Hint>
      <Divider />
      <Typography variant="subtitle2">Mesh along it</Typography>
      <MeshControlFields model={model} update={update} target={sel.name} kind="boundary" />
      <Divider />
      <Button
        size="small"
        color="error"
        startIcon={<Delete />}
        sx={{ alignSelf: 'flex-end' }}
        onClick={() => {
          update((m) => ({
            ...m,
            selections: m.selections.filter((_, i) => i !== index),
            mesh: { ...m.mesh, controls: m.mesh.controls.filter((c) => c.target !== sel.name) },
          }));
          onDeleted();
        }}
      >
        Delete
      </Button>
    </Stack>
  );
}
