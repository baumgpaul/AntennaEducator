import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, MenuItem, Stack, TextField, ToggleButton, Tooltip, Typography } from '@mui/material';
import { AccountTree, Add, Delete, GridOn, HighlightAlt, NearMe, Redo, Undo } from '@mui/icons-material';
import { CollapsibleSection, Hint, Ribbon, RibbonButtons, RibbonGroup, Workspace } from '@/features/workflow/Workspace';
import { EMPTY_MODEL, TEMPLATES, type Selection, type StepKind } from '../model';
import type { FemStudio } from '../useFemStudio';
import GeometryCanvas from '../geometry/GeometryCanvas';
import { ModelTree } from '../geometry/ModelTree';
import { SelectionProperties, StepProperties } from '../geometry/StepProperties';
import { deleteStep, takenNames, uniqueName } from '../geometry/edit';
import { isDraw, TOOL_HINT, type DrawKind, type Tool } from '../geometry/interaction';
import type { Pt } from '../geometry/sequence';
import { runSequence, type Sequence } from '../geometry/sequence';
import { SELECTION_LABEL, STEPS, STEP_GROUPS } from '../geometry/steps';
import { ExprField, StepNotes } from './common';

/** Why a ribbon action cannot run on the selection (null: it can). */
function needs(kind: StepKind, dims: number[]): string | null {
  const info = STEPS[kind];
  if (info.group === 'shape' || info.group === 'curve') return null;
  if (kind === 'surface') return dims.length >= 1 && dims.every((d) => d === 1) ? null : 'Select the lines, arcs or splines around it';
  if (info.group === 'transform') return dims.length >= 1 ? null : 'Select the objects first (tree or canvas)';
  if (dims.length < 2) return kind === 'difference' ? 'Select the object, then ctrl-click what to subtract' : 'Select 2 or more objects (ctrl-click)';
  if (dims.some((d) => d === 0)) return 'Points cannot be combined';
  if (kind !== 'difference' && new Set(dims).size > 1) return 'Select only surfaces or only curves';
  return null;
}

function GeometryTab({ studio }: { studio: FemStudio }) {
  const { model, update, load, runMesh, busy, error, progress } = studio;
  const seq: Sequence = useMemo(() => runSequence(model), [model]);
  const [selected, setSelected] = useState<string[]>([]);
  const [fitKey, setFitKey] = useState(0);
  const [propsOpen, setPropsOpen] = useState(true);
  const [tool, setTool] = useState<Tool>('select');
  const [snapOn, setSnapOn] = useState(true);
  const { undo, redo, canUndo, canRedo } = studio;

  const select = (name: string | null, additive: boolean) =>
    setSelected((s) => (name === null ? (additive ? s : []) : additive ? (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]) : [name]));
  const live = selected.filter((n) => seq.objects.some((o) => o.name === n));
  const liveDims = live.map((n) => seq.objects.find((o) => o.name === n)!.dim);

  const add = (kind: StepKind) => {
    const info = STEPS[kind];
    const name = uniqueName(info.prefix, takenNames(model));
    const b = seq.bounds;
    const span = seq.objects.length ? Math.max(b.xmax - b.xmin, b.ymax - b.ymin) : 0.04;
    const at = { x: seq.objects.length ? (b.xmin + b.xmax) / 2 : 0, y: seq.objects.length ? (b.ymin + b.ymax) / 2 : 0, h: span / 4 };
    const step = info.create(name, at, info.group === 'combine' || info.group === 'transform' ? live : []);
    update((m) => ({ ...m, steps: [...m.steps, step] }), { gesture: `add-${name}` });
    setSelected([name]);
  };

  /** A clicked edge: added to the selected named boundary (edges near points), or a new one. */
  const pickEdge = (at: Pt) => {
    const current = model.selections.find((s) => s.kind === 'points' && selected.length === 1 && s.name === selected[0]);
    if (current && current.kind === 'points') {
      update(
        (m) => ({ ...m, selections: m.selections.map((s) => (s.name === current.name ? { ...current, points: [...current.points, at] } : s)) }),
        { gesture: `pick-${Date.now()}` },
      );
      return;
    }
    const name = uniqueName('edge', takenNames(model));
    update((m) => ({ ...m, selections: [...m.selections, { kind: 'points', name, points: [at] }] }), { gesture: `pick-${name}` });
    setSelected([name]);
  };

  const deleteSelected = useCallback(() => {
    update(
      (m) => {
        let next = m;
        const indices = selected
          .map((n) => next.steps.findIndex((s) => s.name === n))
          .filter((i) => i >= 0)
          .sort((a, b) => b - a);
        for (const i of indices) next = deleteStep(next, i);
        const sels = new Set(selected.filter((n) => m.selections.some((s) => s.name === n)));
        if (sels.size) {
          next = {
            ...next,
            selections: next.selections.filter((s) => !sels.has(s.name)),
            mesh: { ...next.mesh, controls: next.mesh.controls.filter((c) => !sels.has(c.target)) },
          };
        }
        return next;
      },
      { gesture: `delete-${Date.now()}` },
    );
    setSelected([]);
  }, [update, selected]);

  // keyboard: undo/redo, delete, duplicate, escape (the drawing keys are the canvas's)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'd' && live.length) {
        e.preventDefault();
        const name = uniqueName('copy', takenNames(model));
        const b = seq.bounds;
        const dx = Number((0.05 * Math.max(b.xmax - b.xmin, b.ymax - b.ymin)).toPrecision(2));
        update((m) => ({ ...m, steps: [...m.steps, { kind: 'move', name, objects: live, dx, dy: -dx, keep: true }] }), { gesture: `dup-${name}` });
        setSelected([name]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length && tool === 'select') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape' && tool === 'select') {
        setSelected([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, update, deleteSelected, selected, live, model, seq.bounds, tool]);
  const addSelection = (kind: Selection['kind']) => {
    const name = uniqueName('edge', takenNames(model));
    const b = seq.bounds;
    const sel: Selection =
      kind === 'box'
        ? { kind, name, xmin: b.xmin, ymin: b.ymin, xmax: b.xmax, ymax: b.ymin }
        : kind === 'points'
          ? { kind, name, points: [[b.xmin, (b.ymin + b.ymax) / 2]] }
          : { kind, name, domains: live.filter((n) => seq.domains.includes(n)) };
    update((m) => ({ ...m, selections: [...m.selections, sel] }));
    setSelected([name]);
  };

  const stepIndex = selected.length === 1 ? model.steps.findIndex((s) => s.name === selected[0]) : -1;
  const selectionIndex = selected.length === 1 ? model.selections.findIndex((s) => s.name === selected[0]) : -1;
  const meshed = progress.done.has('geometry');
  const notes = progress.notes.geometry;
  const subtitle =
    stepIndex >= 0 ? STEPS[model.steps[stepIndex].kind].label : selectionIndex >= 0 ? 'Named boundary' : selected.length > 1 ? `${selected.length} selected` : undefined;

  return (
    <Workspace
      ribbon={
        <Ribbon>
          <RibbonGroup label="Edit">
            <RibbonButtons>
              <Tooltip title={`Select and move (Esc). ${TOOL_HINT.select}`}>
                <Button aria-label="Select" variant={tool === 'select' ? 'contained' : 'outlined'} onClick={() => setTool('select')} sx={{ minWidth: 40, px: 1 }}>
                  <NearMe fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title={`Name edges: ${TOOL_HINT['pick-edge']}`}>
                <Button
                  aria-label="Name edges"
                  variant={tool === 'pick-edge' ? 'contained' : 'outlined'}
                  onClick={() => setTool(tool === 'pick-edge' ? 'select' : 'pick-edge')}
                  sx={{ minWidth: 40, px: 1 }}
                >
                  <HighlightAlt fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <Button aria-label="Undo" disabled={!canUndo} onClick={undo} sx={{ minWidth: 40, px: 1 }}>
                    <Undo fontSize="small" />
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Y)">
                <span>
                  <Button aria-label="Redo" disabled={!canRedo} onClick={redo} sx={{ minWidth: 40, px: 1 }}>
                    <Redo fontSize="small" />
                  </Button>
                </span>
              </Tooltip>
            </RibbonButtons>
            <Tooltip title="Snap to corners, centres and a fine grid">
              <ToggleButton size="small" value="snap" selected={snapOn} onChange={() => setSnapOn((x) => !x)} aria-label="Snap">
                <GridOn fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </RibbonGroup>
          <RibbonGroup label="Template">
            <TextField
              select
              size="small"
              value=""
              label="Start from"
              sx={{ width: 170 }}
              onChange={(e) => {
                const t = TEMPLATES.find((x) => x.id === e.target.value);
                load(t ? t.model : EMPTY_MODEL);
                setSelected([]);
                setFitKey((k) => k + 1);
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
          {STEP_GROUPS.map((g) => (
            <RibbonGroup key={g.group} label={g.label}>
              <RibbonButtons>
                {g.kinds.map((kind) => {
                  const info = STEPS[kind];
                  const Icon = info.icon;
                  const why = needs(kind, liveDims);
                  const drawTool = isDraw(kind as Tool);
                  const title = why ? `${info.label}: ${why}` : drawTool ? `${info.label}: ${TOOL_HINT[kind as DrawKind]}` : `${info.label}: ${info.help}`;
                  return (
                    <Tooltip key={kind} title={title}>
                      <span>
                        <Button
                          aria-label={info.label}
                          aria-pressed={drawTool ? tool === kind : undefined}
                          variant={tool === kind ? 'contained' : 'outlined'}
                          disabled={!!why}
                          onClick={() => (drawTool ? setTool(tool === kind ? 'select' : (kind as DrawKind)) : add(kind))}
                          sx={{ minWidth: 40, px: 1 }}
                        >
                          <Icon fontSize="small" />
                        </Button>
                      </span>
                    </Tooltip>
                  );
                })}
              </RibbonButtons>
            </RibbonGroup>
          ))}
          <RibbonGroup label="Domains & boundaries">
            <RibbonButtons>
              <Tooltip title="The mesher joins the objects into domains and names their boundaries — materials and conditions attach to these.">
                <span>
                  <Button startIcon={<AccountTree />} onClick={runMesh} disabled={busy !== null || seq.errors.length > 0 || model.steps.length === 0}>
                    {busy === 'mesh' ? 'Meshing…' : 'Find'}
                  </Button>
                </span>
              </Tooltip>
            </RibbonButtons>
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
          <CollapsibleSection
            title="Parameters"
            action={
              <Tooltip title="Add a parameter">
                <IconButton
                  size="small"
                  aria-label="Add a parameter"
                  onClick={() => update((m) => ({ ...m, parameters: { ...m.parameters, [uniqueName('p', Object.keys(m.parameters))]: 0 } }))}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            <Stack spacing={1}>
              {Object.entries(model.parameters).map(([name, value], i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={name}
                    sx={{ width: 76 }}
                    onChange={(e) =>
                      update((m) => ({
                        ...m,
                        parameters: Object.fromEntries(Object.entries(m.parameters).map(([k, v]) => [k === name ? e.target.value : k, v])),
                      }))
                    }
                  />
                  <ExprField label="Value" value={value} width={120} onChange={(v) => update((m) => ({ ...m, parameters: { ...m.parameters, [name]: v } }))} />
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
          </CollapsibleSection>
          <CollapsibleSection title="Geometry tree">
            <ModelTree tree={seq.tree} selected={selected} onSelect={(n, additive) => select(n, additive)} />
            <Box sx={{ mt: 1 }}>
              <Hint>Later objects win where objects overlap. Ctrl-click to select several, then combine or transform them.</Hint>
            </Box>
          </CollapsibleSection>
          <CollapsibleSection title="Named boundaries" defaultExpanded={model.selections.length > 0}>
            <Stack spacing={0.5}>
              {model.selections.map((s) => (
                <Box
                  key={s.name}
                  role="button"
                  onClick={() => setSelected([s.name])}
                  sx={{ px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', bgcolor: selected.includes(s.name) ? 'action.selected' : undefined, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <Typography variant="body2">{s.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {SELECTION_LABEL[s.kind]}
                  </Typography>
                </Box>
              ))}
              <TextField select size="small" label="Name edges…" value="" onChange={(e) => addSelection(e.target.value as Selection['kind'])}>
                {(Object.keys(SELECTION_LABEL) as Selection['kind'][]).map((k) => (
                  <MenuItem key={k} value={k}>
                    {SELECTION_LABEL[k]}
                  </MenuItem>
                ))}
              </TextField>
              <Hint>Edges get names automatically (outer, a|b between domains, a hole's name); name others here to put a condition on them.</Hint>
            </Stack>
          </CollapsibleSection>
          {meshed && studio.mesh && (
            <CollapsibleSection title="Domains & boundaries">
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="body2">Domains:</Typography>
                  {progress.domains.map((d) => (
                    <Chip key={d} size="small" label={d} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="body2">Boundaries:</Typography>
                  {progress.boundaries.map((b) => (
                    <Chip key={b} size="small" variant="outlined" label={b} />
                  ))}
                </Stack>
                {studio.mesh.warnings.map((w) => (
                  <Typography key={w} variant="body2" sx={{ color: 'warning.main' }}>
                    {w}
                  </Typography>
                ))}
                <Hint>Domains take a material, boundaries a condition.</Hint>
              </Stack>
            </CollapsibleSection>
          )}
        </>
      }
      right={
        stepIndex >= 0 ? (
          <StepProperties
            key={stepIndex}
            model={model}
            update={update}
            seq={seq}
            index={stepIndex}
            onRenamed={(n) => setSelected([n])}
            onDeleted={() => setSelected([])}
          />
        ) : selectionIndex >= 0 ? (
          <SelectionProperties
            key={`sel${selectionIndex}`}
            model={model}
            update={update}
            seq={seq}
            index={selectionIndex}
            onRenamed={(n) => setSelected([n])}
            onDeleted={() => setSelected([])}
          />
        ) : (
          <Hint>
            {selected.length > 1
              ? `${selected.join(', ')}: combine or transform them with the ribbon.`
              : 'Select an element in the tree or on the canvas to edit it — its dimensions, its role and its mesh.'}
          </Hint>
        )
      }
      rightSubtitle={subtitle}
      rightOpen={propsOpen}
      onRightToggle={() => setPropsOpen((o) => !o)}
      notes={(!!notes?.length || !!error) && <StepNotes notes={notes} error={error} />}
    >
      <GeometryCanvas
        seq={seq}
        holes={model.holes}
        selected={selected}
        onSelect={select}
        fitKey={fitKey}
        editor={{
          model,
          update,
          tool,
          onToolDone: () => setTool('select'),
          snapOn,
          onPickEdge: pickEdge,
          onInsertDefault: (kind) => {
            add(kind);
            setTool('select');
          },
        }}
      />
    </Workspace>
  );
}

export default GeometryTab;
