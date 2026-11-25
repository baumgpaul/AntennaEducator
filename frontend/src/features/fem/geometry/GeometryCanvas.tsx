/**
 * The geometry canvas: the evaluated sequence drawn in SVG (y up), with pan
 * (drag), zoom (wheel, about the cursor), fit, a grid, cursor coordinates
 * and selection by click (ctrl/shift adds). Booleans are drawn exactly with
 * SVG masks, outlines included, so a union shows no inner edges and a cut
 * shows its new edge.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { FitScreen } from '@mui/icons-material';
import { colorOf, si } from '../views/geometryDraw';
import { objectAt, type Bounds, type Geo, type Pt, type Sequence } from './sequence';

interface View {
  cx: number;
  cy: number;
  /** pixels per metre */
  scale: number;
}

interface Props {
  seq: Sequence;
  holes: string[];
  /** Colour per object (e.g. by material); default: by order */
  fill?: Record<string, string>;
  /** Highlighted objects (also consumed ones, chosen in the tree: dashed) */
  selected?: string[];
  onSelect?: (name: string | null, additive: boolean) => void;
  /** Fit the view again when this changes (e.g. a template was loaded) */
  fitKey?: string | number;
}

const PICK_PX = 6;

function fitView(b: Bounds, w: number, h: number): View {
  const bw = Math.max(b.xmax - b.xmin, 1e-12), bh = Math.max(b.ymax - b.ymin, 1e-12);
  return { cx: (b.xmin + b.xmax) / 2, cy: (b.ymin + b.ymax) / 2, scale: 0.88 * Math.min(w / bw, h / bh) };
}

/** 1, 2 or 5 × 10ⁿ metres, at least `min` */
function niceStep(min: number): number {
  const p = 10 ** Math.floor(Math.log10(min));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= min) ?? 10 * p;
}

const pathOf = (lines: Pt[][], close: boolean) =>
  lines.map((l) => `M${l.map(([x, y]) => `${x} ${y}`).join('L')}${close ? 'Z' : ''}`).join('');

const hasFill = (g: Geo): boolean =>
  g.op === 'fill' || (g.op === 'group' ? g.items.some(hasFill) : g.op === 'cut' || g.op === 'common' ? hasFill(g.a) : false);

/** Builds the SVG of geometries; masks get unique ids. */
class Painter {
  private n = 0;
  constructor(
    private prefix: string,
    private region: { x: number; y: number; width: number; height: number },
    private px: number, // metres per pixel
  ) {}

  /** content shown only inside (or with invert: outside) the surface of g */
  private masked(content: ReactNode, g: Geo, invert: boolean, key: string): ReactNode {
    const id = `${this.prefix}m${this.n++}`;
    return (
      <g key={key}>
        <mask id={id} maskUnits="userSpaceOnUse" {...this.region}>
          <rect {...this.region} fill={invert ? 'white' : 'black'} />
          {this.fill(g, invert ? 'black' : 'white', 'm')}
        </mask>
        <g mask={`url(#${id})`}>{content}</g>
      </g>
    );
  }

  fill(g: Geo, color: string, key = 'f'): ReactNode {
    switch (g.op) {
      case 'fill':
        return <path key={key} d={pathOf(g.loops, true)} fill={color} fillRule="evenodd" />;
      case 'group':
        return <g key={key}>{g.items.map((i, k) => this.fill(i, color, `${key}${k}`))}</g>;
      case 'cut':
        return this.masked(this.fill(g.a, color), g.b, true, key);
      case 'common':
        return this.masked(this.fill(g.a, color), g.b, false, key);
      default:
        return null;
    }
  }

  outline(g: Geo, stroke: Record<string, string | number>, key = 'o'): ReactNode {
    const line = { fill: 'none', vectorEffect: 'non-scaling-stroke' as const, ...stroke };
    switch (g.op) {
      case 'fill':
        return <path key={key} d={pathOf(g.loops, true)} {...line} />;
      case 'lines':
        return <path key={key} d={pathOf(g.paths, false)} {...line} strokeWidth={Number(stroke.strokeWidth ?? 1) + 1} strokeLinecap="round" />;
      case 'dots':
        return (
          <g key={key}>
            {g.pts.map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={3.5 * this.px} fill={String(stroke.stroke)} />
            ))}
          </g>
        );
      case 'group': {
        // each part's outline outside the other parts: no inner edges
        return (
          <g key={key}>
            {g.items.map((item, k) => {
              const others: Geo = { op: 'group', items: g.items.filter((_, j) => j !== k) };
              const o = this.outline(item, stroke, `${key}${k}`);
              return hasFill(others) ? this.masked(o, others, true, `${key}${k}`) : o;
            })}
          </g>
        );
      }
      case 'cut':
        return (
          <g key={key}>
            {this.masked(this.outline(g.a, stroke), g.b, true, 'a')}
            {hasFill(g.a) && this.masked(this.outline(g.b, stroke), g.a, false, 'b')}
          </g>
        );
      case 'common':
        return (
          <g key={key}>
            {this.masked(this.outline(g.a, stroke), g.b, false, 'a')}
            {hasFill(g.a) && this.masked(this.outline(g.b, stroke), g.a, false, 'b')}
          </g>
        );
    }
  }
}

function GeometryCanvas({ seq, holes, fill, selected = [], onSelect, fitKey }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const prefix = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ w: 600, h: 420 });
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);

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

  // fit when asked (fitKey) or when there was nothing to show before
  const empty = seq.objects.length === 0;
  const fit = useCallback(() => setView(fitView(seq.bounds, size.w, size.h)), [seq.bounds, size]);
  const lastFit = useRef<{ key?: string | number; empty: boolean; w: number } | null>(null);
  useEffect(() => {
    const last = lastFit.current;
    if (!last || last.key !== fitKey || (last.empty && !empty) || (last.w !== size.w && !view)) {
      lastFit.current = { key: fitKey, empty, w: size.w };
      fit(); // follows outside changes: a template, the first content, the first layout
    }
  }, [fitKey, empty, size.w, fit, view]);

  const v = view ?? fitView(seq.bounds, size.w, size.h);
  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = ref.current!.getBoundingClientRect();
      return [v.cx + (clientX - r.left - size.w / 2) / v.scale, v.cy - (clientY - r.top - size.h / 2) / v.scale];
    },
    [v, size],
  );

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

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, view: v, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    setCursor(toWorld(e.clientX, e.clientY));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) setPanning(true);
    d.moved = true;
    setView({ ...d.view, cx: d.view.cx - dx / d.view.scale, cy: d.view.cy + dy / d.view.scale });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (d && !d.moved && onSelect && e.button === 0) {
      const name = objectAt(seq.objects, toWorld(e.clientX, e.clientY), PICK_PX / v.scale);
      onSelect(name, e.shiftKey || e.ctrlKey || e.metaKey);
    }
  };

  const px = 1 / v.scale;
  const vb = { x: v.cx - size.w / 2 / v.scale, y: -(v.cy + size.h / 2 / v.scale), width: size.w / v.scale, height: size.h / v.scale };
  const content = useMemo(() => {
    const b = seq.bounds;
    const span = Math.max(b.xmax - b.xmin, b.ymax - b.ymin, 1e-9);
    const region = { x: b.xmin - 3 * span, y: b.ymin - 3 * span, width: 7 * span, height: 7 * span };
    const painter = new Painter(prefix, region, px);
    const sel = new Set(selected);
    const liveNames = new Set(seq.objects.map((o) => o.name));
    return (
      <>
        {seq.objects.map((o, i) => {
          const isHole = holes.includes(o.name);
          const color = isHole ? `url(#${prefix}hatch)` : (fill?.[o.name] ?? colorOf(i));
          return (
            <g key={o.name} data-object={o.name}>
              <g opacity={isHole ? 1 : 0.55}>{painter.fill(o.geo, color)}</g>
              {painter.outline(o.geo, { stroke: o.dim === 2 ? '#333' : '#1a237e', strokeWidth: 1 })}
            </g>
          );
        })}
        {[...sel].filter((n) => seq.created[n]).map((n) =>
          <g key={`sel-${n}`}>{painter.outline(seq.created[n].geo, { stroke: '#d32f2f', strokeWidth: 3, ...(liveNames.has(n) ? {} : { strokeDasharray: '6 4' }) })}</g>,
        )}
      </>
    );
    // px changes with zoom: only the point markers depend on it
  }, [seq, holes, fill, selected, prefix, px]);

  const grid = useMemo(() => {
    const step = niceStep(40 / v.scale);
    const x0 = Math.floor(vb.x / step) * step, y0 = Math.floor(-(vb.y + vb.height) / step) * step;
    const lines: ReactNode[] = [];
    for (let x = x0; x <= vb.x + vb.width; x += step) {
      lines.push(<line key={`x${x}`} x1={x} x2={x} y1={-(vb.y + vb.height)} y2={-vb.y} stroke={Math.abs(x) < step / 2 ? '#9e9e9e' : '#e6e6e6'} vectorEffect="non-scaling-stroke" />);
    }
    for (let y = y0; y <= -vb.y; y += step) {
      lines.push(<line key={`y${y}`} y1={y} y2={y} x1={vb.x} x2={vb.x + vb.width} stroke={Math.abs(y) < step / 2 ? '#9e9e9e' : '#e6e6e6'} vectorEffect="non-scaling-stroke" />);
    }
    return { lines, step };
  }, [v.scale, vb.x, vb.y, vb.width, vb.height]);

  const hatch = 8 * px;
  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <svg
        ref={ref}
        viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
        style={{ width: '100%', height: '100%', display: 'block', background: 'var(--mui-palette-background-default, #fafafa)', cursor: panning ? 'grabbing' : 'default', touchAction: 'none' }}
        role="img"
        aria-label="Geometry"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <pattern id={`${prefix}hatch`} patternUnits="userSpaceOnUse" width={hatch} height={hatch} patternTransform="rotate(45)">
            <rect width={hatch} height={hatch} fill="#ddd" />
            <line x1={0} y1={0} x2={0} y2={hatch} stroke="#888" strokeWidth={hatch / 4} />
          </pattern>
        </defs>
        <g transform="scale(1,-1)">
          {grid.lines}
          {content}
        </g>
      </svg>
      <Tooltip title="Fit the view">
        <IconButton size="small" onClick={fit} aria-label="Fit the view" sx={{ position: 'absolute', right: 8, top: 8, bgcolor: 'background.paper', boxShadow: 1 }}>
          <FitScreen fontSize="small" />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" sx={{ color: 'text.secondary', position: 'absolute', left: 8, bottom: 4, pointerEvents: 'none' }}>
        {cursor ? `x ${si(cursor[0], 'm', 4)}, y ${si(cursor[1], 'm', 4)}` : `${si(seq.bounds.xmax - seq.bounds.xmin, 'm', 3)} × ${si(seq.bounds.ymax - seq.bounds.ymin, 'm', 3)}`}
        {` · grid ${si(grid.step, 'm', 1)}`}
      </Typography>
    </Box>
  );
}

export default GeometryCanvas;
