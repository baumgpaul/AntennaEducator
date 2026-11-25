/**
 * The geometry canvas: the evaluated sequence drawn in SVG (y up) with pan,
 * zoom about the cursor, fit, grid and rulers. With an `editor` it is also
 * the drawing board: tools draw new steps, objects are dragged, handles
 * resize the selected primitive, edges are picked — all snapped to corners,
 * centres and the grid.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { FitScreen } from '@mui/icons-material';
import { evaluate } from '../expressions';
import type { FemModel, Step } from '../model';
import { colorOf, si } from '../views/geometryDraw';
import { replaceStep } from './edit';
import {
  directStep,
  dragHandle,
  drawnStep,
  GESTURE,
  handlesOf,
  isDraw,
  moveObjects,
  nearestEdgePoint,
  newName,
  niceStep,
  snap,
  snapTargets,
  TOOL_HINT,
  type DrawKind,
  type Tool,
} from './interaction';
import { pathOf, Painter } from './painter';
import { objectAt, stepGeo, type Bounds, type Pt, type Sequence } from './sequence';

interface View {
  cx: number;
  cy: number;
  /** pixels per metre */
  scale: number;
}

export interface CanvasEditor {
  model: FemModel;
  update: (change: (m: FemModel) => FemModel, options?: { gesture?: string }) => void;
  tool: Tool;
  /** The tool finished (a shape was drawn) or was cancelled */
  onToolDone: () => void;
  snapOn: boolean;
  /** A picked point on an edge (pick-edge tool) */
  onPickEdge: (at: Pt) => void;
  /** Enter with nothing drawn: insert the tool's default shape */
  onInsertDefault: (kind: DrawKind) => void;
}

interface Props {
  seq: Sequence;
  holes: string[];
  /** Colour per object (e.g. by material); default: by order */
  fill?: Record<string, string>;
  /** Highlighted objects or named boundaries (consumed objects, chosen in the tree: dashed) */
  selected?: string[];
  onSelect?: (name: string | null, additive: boolean) => void;
  /** Fit the view again when this changes (e.g. a template was loaded) */
  fitKey?: string | number;
  editor?: CanvasEditor;
}

type Gesture =
  | { type: 'pan'; x: number; y: number; view: View; moved: boolean; hit: string | null; additive: boolean }
  | { type: 'move'; x: number; y: number; anchor: Pt; names: string[]; delta: Pt; moved: boolean; hit: string; additive: boolean; targets: Pt[] }
  | { type: 'handle'; index: number; id: string; gesture: string; targets: Pt[] }
  | { type: 'draw'; kind: DrawKind; a: Pt; b: Pt };

const PICK_PX = 6;
const HANDLE_PX = 5;
const SNAP_PX = 9;
let gestureCount = 0;

function fitView(b: Bounds, w: number, h: number): View {
  const bw = Math.max(b.xmax - b.xmin, 1e-12), bh = Math.max(b.ymax - b.ymin, 1e-12);
  return { cx: (b.xmin + b.xmax) / 2, cy: (b.ymin + b.ymax) / 2, scale: 0.88 * Math.min(w / bw, h / bh) };
}

function GeometryCanvas({ seq, holes, fill, selected = [], onSelect, fitKey, editor }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const prefix = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ w: 600, h: 420 });
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState<{ raw: Pt; snapped: Pt; target: boolean } | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [clicks, setClicks] = useState<Pt[]>([]);

  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // fit when asked (fitKey), when there was nothing to show before, on the first layout
  const empty = seq.objects.length === 0;
  const fit = useCallback(() => setView(fitView(seq.bounds, size.w, size.h)), [seq.bounds, size]);
  const lastFit = useRef<{ key?: string | number; empty: boolean; w: number } | null>(null);
  useEffect(() => {
    const last = lastFit.current;
    if (!last || last.key !== fitKey || (last.empty && !empty) || (last.w !== size.w && !view)) {
      lastFit.current = { key: fitKey, empty, w: size.w };
      fit();
    }
  }, [fitKey, empty, size.w, fit, view]);

  const v = view ?? fitView(seq.bounds, size.w, size.h);
  const px = 1 / v.scale;
  const grid = niceStep(40 * px);
  const snapStep = editor?.snapOn ? niceStep(10 * px) : null;

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = ref.current!.getBoundingClientRect();
      return [v.cx + (clientX - r.left - size.w / 2) / v.scale, v.cy - (clientY - r.top - size.h / 2) / v.scale];
    },
    [v, size],
  );
  const toScreen = ([x, y]: Pt): Pt => [(x - v.cx) * v.scale + size.w / 2, (v.cy - y) * v.scale + size.h / 2];

  const tool = editor?.tool ?? 'select';
  const editModel = editor?.model;
  const targets = useMemo(() => (editModel ? snapTargets(editModel, seq) : []), [editModel, seq]);
  const snapAt = useCallback(
    (p: Pt, t: Pt[] = targets) => (editor?.snapOn ? snap(p, { grid: snapStep, targets: t, radius: SNAP_PX * px }) : snap(p, { grid: null, targets: [], radius: 0 })),
    [editor?.snapOn, snapStep, targets, px],
  );

  // the single selected primitive the mouse may resize
  const handleStep = useMemo(() => {
    if (!editModel || tool !== 'select' || selected.length !== 1) return null;
    const i = directStep(editModel, selected[0]);
    return i === null ? null : { index: i, handles: handlesOf(editModel.steps[i]) };
  }, [editModel, tool, selected]);

  // wheel zoom about the cursor (a non-passive listener, so the page does not scroll)
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const k = Math.exp(-e.deltaY * 0.0015);
      setView({ scale: v.scale * k, cx: wx - (wx - v.cx) / k, cy: wy - (wy - v.cy) / k });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toWorld, v]);

  // finishing and cancelling a drawing: Enter, Escape (the tab handles the other keys)
  const finishClicks = useCallback(
    (pts: Pt[]) => {
      if (!editor || !isDraw(tool)) return;
      const step = drawnStep(tool, pts, newName(editor.model, tool), snapStep ?? undefined);
      setClicks([]);
      if (!step) return;
      editor.update((m) => ({ ...m, steps: [...m.steps, step] }), { gesture: `draw-${++gestureCount}` });
      onSelect?.(step.name, false);
      editor.onToolDone();
    },
    [editor, tool, snapStep, onSelect],
  );
  useEffect(() => {
    if (!editor || tool === 'select') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (clicks.length || gesture) {
          setClicks([]);
          setGesture(null);
        } else editor.onToolDone();
      } else if (e.key === 'Enter' && isDraw(tool)) {
        const g = GESTURE[tool];
        if (clicks.length === 0) editor.onInsertDefault(tool);
        else if (g.kind === 'open' && clicks.length >= g.min) finishClicks(clicks);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, tool, clicks, gesture, finishClicks]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const raw = toWorld(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const pan: Gesture = { type: 'pan', x: e.clientX, y: e.clientY, view: v, moved: false, hit: null, additive };
    if (e.button === 1 || !editor) {
      setGesture({ ...pan, hit: e.button === 0 ? objectAt(seq.objects, raw, PICK_PX * px) : null });
      return;
    }
    if (isDraw(tool)) {
      if (GESTURE[tool].kind === 'drag') {
        const a = snapAt(raw).at;
        setGesture({ type: 'draw', kind: tool, a, b: a });
      }
      return;
    }
    if (tool === 'pick-edge') return;
    // select tool: a handle, an object (move it), or the background (pan)
    const handle = handleStep?.handles.find((h) => Math.hypot(h.at[0] - raw[0], h.at[1] - raw[1]) <= (HANDLE_PX + 3) * px);
    if (handle && handleStep) {
      const name = editor.model.steps[handleStep.index].name;
      setGesture({ type: 'handle', index: handleStep.index, id: handle.id, gesture: `handle-${++gestureCount}`, targets: snapTargets(editor.model, seq, [name]) });
      return;
    }
    const hit = objectAt(seq.objects, raw, PICK_PX * px);
    if (hit) {
      const names = selected.includes(hit) ? selected.filter((n) => seq.objects.some((o) => o.name === n)) : [hit];
      const moveTargets = snapTargets(editor.model, seq, names);
      // the anchor: the grabbed point, snapped to the object's own corner if near one
      const own = snapTargets(editor.model, seq).filter((t) => !moveTargets.some((m) => m[0] === t[0] && m[1] === t[1]));
      const anchor = snap(raw, { grid: snapStep, targets: own, radius: SNAP_PX * px }).at;
      setGesture({ type: 'move', x: e.clientX, y: e.clientY, anchor, names, delta: [0, 0], moved: false, hit, additive, targets: moveTargets });
      return;
    }
    setGesture(pan);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const raw = toWorld(e.clientX, e.clientY);
    const g = gesture;
    const s = g?.type === 'move' || g?.type === 'handle' ? snapAt(raw, g.targets) : snapAt(raw);
    setCursor({ raw, snapped: s.at, target: s.target });
    if (!g) return;
    if (g.type === 'pan') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;
      setGesture({ ...g, moved: true });
      setView({ ...g.view, cx: g.view.cx - dx / g.view.scale, cy: g.view.cy + dy / g.view.scale });
    } else if (g.type === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
      setGesture({ ...g, moved: true, delta: [s.at[0] - g.anchor[0], s.at[1] - g.anchor[1]] });
    } else if (g.type === 'handle' && editor) {
      editor.update((m) => replaceStep(m, g.index, dragHandle(m.steps[g.index], g.id, s.at)), { gesture: g.gesture });
    } else if (g.type === 'draw') {
      setGesture({ ...g, b: s.at });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture;
    setGesture(null);
    const raw = toWorld(e.clientX, e.clientY);
    if (g?.type === 'pan') {
      if (!g.moved && e.button === 0 && onSelect) onSelect(g.hit, g.additive);
      return;
    }
    if (g?.type === 'move') {
      if (!g.moved) onSelect?.(g.hit, g.additive);
      else if (editor && (g.delta[0] || g.delta[1])) {
        editor.update((m) => moveObjects(m, g.names, g.delta[0], g.delta[1]), { gesture: `move-${++gestureCount}` });
        if (!selected.includes(g.hit)) onSelect?.(g.hit, false);
      }
      return;
    }
    if (g?.type === 'handle') return;
    if (g?.type === 'draw') {
      finishClicks([g.a, g.b]);
      return;
    }
    if (!editor || e.button !== 0) return;
    if (tool === 'pick-edge') {
      const at = nearestEdgePoint(seq, raw, 10 * px);
      if (at) editor.onPickEdge(at);
      return;
    }
    if (isDraw(tool)) {
      const gk = GESTURE[tool];
      const pts = [...clicks, snapAt(raw).at];
      if (gk.kind === 'clicks' && pts.length >= gk.n) finishClicks(pts);
      else setClicks(pts);
    }
  };

  const onDoubleClick = () => {
    if (!isDraw(tool)) return;
    const gk = GESTURE[tool];
    if (gk.kind === 'open' && clicks.length >= gk.min) finishClicks(clicks);
  };

  const vb = { x: v.cx - size.w / 2 / v.scale, y: -(v.cy + size.h / 2 / v.scale), width: size.w / v.scale, height: size.h / v.scale };
  const moving = gesture?.type === 'move' && gesture.moved ? gesture : null;

  const content = useMemo(() => {
    const b = seq.bounds;
    const span = Math.max(b.xmax - b.xmin, b.ymax - b.ymin, 1e-9);
    const region = { x: b.xmin - 3 * span, y: b.ymin - 3 * span, width: 7 * span, height: 7 * span };
    const painter = new Painter(prefix, region, px);
    const sel = new Set(selected);
    const liveNames = new Set(seq.objects.map((o) => o.name));
    const shift = (name: string) => (moving?.names.includes(name) ? `translate(${moving.delta[0]} ${moving.delta[1]})` : undefined);
    return (
      <>
        {seq.objects.map((o, i) => {
          const isHole = holes.includes(o.name);
          const color = isHole ? `url(#${prefix}hatch)` : (fill?.[o.name] ?? colorOf(i));
          return (
            <g key={o.name} data-object={o.name} transform={shift(o.name)}>
              <g opacity={isHole ? 1 : 0.55}>{painter.fill(o.geo, color)}</g>
              {painter.outline(o.geo, { stroke: o.dim === 2 ? '#333' : '#1a237e', strokeWidth: 1 })}
            </g>
          );
        })}
        {[...sel]
          .filter((n) => seq.created[n])
          .map((n) => (
            <g key={`sel-${n}`} transform={shift(n)}>
              {painter.outline(seq.created[n].geo, { stroke: '#d32f2f', strokeWidth: 3, ...(liveNames.has(n) ? {} : { strokeDasharray: '6 4' }) })}
            </g>
          ))}
      </>
    );
  }, [seq, holes, fill, selected, prefix, px, moving]);

  // named boundaries: boxes dashed, points as crosses
  const selections = editor?.model.selections.map((s) => {
    const on = selected.includes(s.name);
    const color = on ? '#d32f2f' : '#6a1b9a';
    try {
      const ev = (x: Parameters<typeof evaluate>[0]) => evaluate(x, seq.values);
      if (s.kind === 'box') {
        const [x0, y0, x1, y1] = [ev(s.xmin), ev(s.ymin), ev(s.xmax), ev(s.ymax)];
        return <rect key={s.name} x={Math.min(x0, x1)} y={Math.min(y0, y1)} width={Math.abs(x1 - x0)} height={Math.abs(y1 - y0)} fill="none" stroke={color} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" strokeWidth={on ? 2 : 1} />;
      }
      if (s.kind === 'points') {
        const r = 5 * px;
        return (
          <g key={s.name} stroke={color} strokeWidth={on ? 2.5 : 1.5}>
            {s.points.map(([x, y], k) => {
              const [cx, cy] = [ev(x), ev(y)];
              return <path key={k} d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx - r} ${cy + r}L${cx + r} ${cy - r}`} vectorEffect="non-scaling-stroke" />;
            })}
          </g>
        );
      }
    } catch {
      /* an invalid expression is reported in the checklist */
    }
    return null;
  });

  // what is being drawn
  let draft: ReactNode = null;
  if (editor && isDraw(tool)) {
    const pts = gesture?.type === 'draw' ? [gesture.a, gesture.b] : cursor ? [...clicks, cursor.snapped] : clicks;
    const step: Step | null = pts.length ? drawnStep(tool, pts, '__draft') : null;
    const geo = step && stepGeo(step, seq.values);
    const painter = new Painter(`${prefix}d`, { x: vb.x, y: -vb.y - vb.height, width: vb.width, height: vb.height }, px);
    draft = (
      <g pointerEvents="none">
        {geo ? painter.outline(geo, { stroke: '#1565c0', strokeWidth: 1.5, strokeDasharray: '5 3' }) : pts.length > 1 && <path d={pathOf([pts], false)} fill="none" stroke="#1565c0" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />}
        {clicks.map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r={3 * px} fill="#1565c0" />
        ))}
      </g>
    );
  }
  const showSnap = editor && cursor && (tool !== 'select' || gesture?.type === 'move' || gesture?.type === 'handle');

  // grid lines and ruler ticks
  const ticks = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (let x = Math.ceil(vb.x / grid) * grid; x <= vb.x + vb.width; x += grid) xs.push(x);
    for (let y = Math.ceil(-(vb.y + vb.height) / grid) * grid; y <= -vb.y; y += grid) ys.push(y);
    return { xs, ys };
  }, [grid, vb.x, vb.y, vb.width, vb.height]);
  const gridLine = (k: string, x1: number, y1: number, x2: number, y2: number, axis: boolean) => (
    <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={axis ? '#9e9e9e' : '#e6e6e6'} vectorEffect="non-scaling-stroke" />
  );
  const label = (value: number) => si(Math.abs(value) < grid / 2 ? 0 : value, 'm', 3);

  const hatch = 8 * px;
  const cursorStyle = gesture?.type === 'pan' && gesture.moved ? 'grabbing' : gesture?.type === 'move' ? 'move' : tool !== 'select' ? 'crosshair' : 'default';
  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <svg
        ref={ref}
        viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
        style={{ width: '100%', height: '100%', display: 'block', background: 'var(--mui-palette-background-default, #fafafa)', cursor: cursorStyle, touchAction: 'none' }}
        role="img"
        aria-label="Geometry"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id={`${prefix}hatch`} patternUnits="userSpaceOnUse" width={hatch} height={hatch} patternTransform="rotate(45)">
            <rect width={hatch} height={hatch} fill="#ddd" />
            <line x1={0} y1={0} x2={0} y2={hatch} stroke="#888" strokeWidth={hatch / 4} />
          </pattern>
        </defs>
        <g transform="scale(1,-1)">
          {ticks.xs.map((x) => gridLine(`x${x}`, x, -(vb.y + vb.height), x, -vb.y, Math.abs(x) < grid / 2))}
          {ticks.ys.map((y) => gridLine(`y${y}`, vb.x, y, vb.x + vb.width, y, Math.abs(y) < grid / 2))}
          {content}
          {selections}
          {handleStep?.handles.map((h) => (
            <rect key={h.id} data-handle={h.id} x={h.at[0] - HANDLE_PX * px} y={h.at[1] - HANDLE_PX * px} width={2 * HANDLE_PX * px} height={2 * HANDLE_PX * px} fill="#fff" stroke="#d32f2f" vectorEffect="non-scaling-stroke" />
          ))}
          {draft}
          {showSnap && <circle cx={cursor.snapped[0]} cy={cursor.snapped[1]} r={(cursor.target ? 5 : 2.5) * px} fill={cursor.target ? 'none' : '#1565c0'} stroke={cursor.target ? '#ef6c00' : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        </g>
      </svg>
      {/* rulers */}
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, pointerEvents: 'none' }}>
        {ticks.xs.map((x) => (
          <Typography key={x} variant="caption" sx={{ position: 'absolute', left: toScreen([x, 0])[0] + 2, bottom: 0, fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap' }}>
            {label(x)}
          </Typography>
        ))}
      </Box>
      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: 2, width: 0, pointerEvents: 'none' }}>
        {ticks.ys.map((y) => (
          <Typography key={y} variant="caption" sx={{ position: 'absolute', top: toScreen([0, y])[1] - 14, left: 0, fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap' }}>
            {label(y)}
          </Typography>
        ))}
      </Box>
      <Tooltip title="Fit the view">
        <IconButton size="small" onClick={fit} aria-label="Fit the view" sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'background.paper', boxShadow: 1 }}>
          <FitScreen fontSize="small" />
        </IconButton>
      </Tooltip>
      {editor && tool !== 'select' && (
        <Typography variant="body2" sx={{ position: 'absolute', left: 8, top: 8, px: 1, py: 0.5, borderRadius: 1, bgcolor: 'background.paper', boxShadow: 1, pointerEvents: 'none' }}>
          {TOOL_HINT[tool]} · Esc to stop{isDraw(tool) ? ' · Enter: a default one' : ''}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', position: 'absolute', right: 8, bottom: 18, pointerEvents: 'none', bgcolor: 'background.paper', px: 0.5, borderRadius: 0.5 }}>
        {cursor ? `x ${si((showSnap ? cursor.snapped : cursor.raw)[0], 'm', 4)}, y ${si((showSnap ? cursor.snapped : cursor.raw)[1], 'm', 4)}` : `${si(seq.bounds.xmax - seq.bounds.xmin, 'm', 3)} × ${si(seq.bounds.ymax - seq.bounds.ymin, 'm', 3)}`}
        {` · grid ${si(grid, 'm', 1)}`}
        {snapStep ? ` · snap ${si(snapStep, 'm', 1)}` : ''}
      </Typography>
    </Box>
  );
}

export default GeometryCanvas;
