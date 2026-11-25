import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { MeshData } from '../api';
import { colorOf, colormap } from './geometryDraw';
import { findTriangle } from './meshGeometry';

export interface MeshViewProps {
  mesh: MeshData;
  /** Per-element values (triangles, then quads), coloured with the colour map; default: domain colours */
  elementValues?: number[];
  /** Per-node values for contour lines (e.g. the potential) */
  contours?: { values: number[]; levels: number };
  showEdges?: boolean;
  highlightBoundaries?: string[];
  /** Elements outlined in red (e.g. poor quality) */
  highlightElements?: number[];
  selectedTriangle?: number | null;
  onPickTriangle?: (index: number) => void;
  /** Zoom to this element when it changes */
  focusElement?: number | null;
  /** Pixels, or 'fill' to take the height of the parent (a flex column) */
  height?: number | 'fill';
}

/** world centre and pixels per metre, or null: fit the mesh */
type View = { cx: number; cy: number; s: number } | null;

/** Corner node indices of element e (triangles first, then quads). */
function cornersOf(mesh: MeshData, e: number): number[] {
  const nTri = mesh.triangles.length / 3;
  if (e < nTri) return [mesh.triangles[3 * e], mesh.triangles[3 * e + 1], mesh.triangles[3 * e + 2]];
  const q = e - nTri, quads = mesh.quads ?? [];
  return [quads[4 * q], quads[4 * q + 1], quads[4 * q + 2], quads[4 * q + 3]];
}

/** Canvas renderer for meshes and fields (y up, aspect ratio kept): wheel zooms, drag pans, double-click fits. */
function MeshView({
  mesh,
  elementValues,
  contours,
  showEdges = true,
  highlightBoundaries = [],
  highlightElements = [],
  selectedTriangle,
  onPickTriangle,
  focusElement,
  height = 420,
}: MeshViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the canvas size in CSS pixels, followed as the layout changes
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>(null);
  const drag = useRef<{ x: number; y: number; view: { cx: number; cy: number; s: number }; moved: boolean } | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height: h } = entry.contentRect;
      setSize((old) => (old && old.w === width && old.h === h ? old : { w: width, h }));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  const bounds = useMemo(() => {
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (let i = 0; i < mesh.nodes.length; i += 2) {
      xmin = Math.min(xmin, mesh.nodes[i]);
      xmax = Math.max(xmax, mesh.nodes[i]);
      ymin = Math.min(ymin, mesh.nodes[i + 1]);
      ymax = Math.max(ymax, mesh.nodes[i + 1]);
    }
    return { xmin, ymin, xmax, ymax };
  }, [mesh]);
  // a new mesh starts fitted
  const [shown, setShown] = useState(mesh);
  if (shown !== mesh) {
    setShown(mesh);
    setView(null);
  }

  const range = useMemo(() => {
    if (!elementValues?.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const v of elementValues) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [elementValues]);

  const cw = size?.w || 600;
  const ch = height === 'fill' ? size?.h || 420 : height;
  const fitted = useMemo(() => {
    const pad = 12;
    const w = bounds.xmax - bounds.xmin || 1, h = bounds.ymax - bounds.ymin || 1;
    return { cx: (bounds.xmin + bounds.xmax) / 2, cy: (bounds.ymin + bounds.ymax) / 2, s: Math.min((cw - 2 * pad) / w, (ch - 2 * pad) / h) };
  }, [bounds, cw, ch]);
  const v = view ?? fitted;

  // zoom to an element (e.g. the worst one)
  useEffect(() => {
    if (focusElement == null || focusElement < 0) return;
    const ids = cornersOf(mesh, focusElement);
    const xs = ids.map((i) => mesh.nodes[2 * i]), ys = ids.map((i) => mesh.nodes[2 * i + 1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-12);
    // zooming follows the chosen element, an outside choice
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, s: Math.min(cw, ch) / (8 * span) });
  }, [focusElement, mesh, cw, ch]);

  // wheel zoom about the cursor (non-passive: the page must not scroll)
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const wx = v.cx + (e.clientX - r.left - cw / 2) / v.s, wy = v.cy - (e.clientY - r.top - ch / 2) / v.s;
      const k = Math.exp(-e.deltaY * 0.0015);
      setView({ s: v.s * k, cx: wx - (wx - v.cx) / k, cy: wy - (wy - v.cy) / k });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [v, cw, ch]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const X = (i: number) => cw / 2 + v.s * (mesh.nodes[2 * i] - v.cx);
    const Y = (i: number) => ch / 2 - v.s * (mesh.nodes[2 * i + 1] - v.cy);
    const nTri = mesh.triangles.length / 3;
    const nQuad = (mesh.quads?.length ?? 0) / 4;
    const nElements = nTri + nQuad;
    const path = (ids: number[]) => {
      ctx.beginPath();
      ctx.moveTo(X(ids[0]), Y(ids[0]));
      for (let k = 1; k < ids.length; k++) ctx.lineTo(X(ids[k]), Y(ids[k]));
      ctx.closePath();
    };

    for (let e = 0; e < nElements; e++) {
      path(cornersOf(mesh, e));
      const domain = e < nTri ? mesh.triangle_domain[e] : (mesh.quad_domain ?? [])[e - nTri];
      ctx.fillStyle = elementValues && range ? colormap((elementValues[e] - range.lo) / (range.hi - range.lo)) : colorOf(domain);
      ctx.fill();
      if (showEdges && nElements < 20000) {
        ctx.strokeStyle = elementValues ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = ctx.fillStyle; // close hairline gaps
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    if (contours) drawContours(ctx, mesh, contours.values, contours.levels, X, Y);

    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 2;
    for (const e of highlightElements) {
      if (e < nElements) {
        path(cornersOf(mesh, e));
        ctx.stroke();
      }
    }

    // highlighted boundaries
    for (const name of highlightBoundaries) {
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 3;
      for (const k of mesh.boundaries[name] ?? []) {
        const a = mesh.edges[2 * k], b = mesh.edges[2 * k + 1];
        ctx.beginPath();
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
        ctx.stroke();
      }
    }

    if (selectedTriangle != null && selectedTriangle < nTri) {
      path(cornersOf(mesh, selectedTriangle));
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }, [mesh, elementValues, range, contours, showEdges, highlightBoundaries, highlightElements, selectedTriangle, v, cw, ch]);

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: ev.clientX, y: ev.clientY, view: v, moved: false };
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setView({ ...d.view, cx: d.view.cx - dx / d.view.s, cy: d.view.cy + dy / d.view.s });
  };
  const onPointerUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved || !onPickTriangle) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = v.cx + (ev.clientX - rect.left - cw / 2) / v.s;
    const y = v.cy - (ev.clientY - rect.top - ch / 2) / v.s;
    const e = findTriangle(mesh, x, y);
    if (e >= 0) onPickTriangle(e);
  };

  return (
    <Box sx={height === 'fill' ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      <canvas
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (drag.current = null)}
        onDoubleClick={() => setView(null)}
        style={{
          width: '100%',
          height: height === 'fill' ? undefined : height,
          flex: height === 'fill' ? '1 1 0' : undefined,
          minHeight: 0,
          display: 'block',
          cursor: onPickTriangle ? 'crosshair' : 'grab',
          touchAction: 'none',
        }}
        aria-label="Mesh"
      />
      {range && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, fontSize: 12 }}>
          <span>{range.lo.toPrecision(3)}</span>
          <Box
            sx={{
              flex: 1,
              height: 10,
              borderRadius: 1,
              background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(colormap).join(',')})`,
            }}
          />
          <span>{range.hi.toPrecision(3)}</span>
        </Box>
      )}
    </Box>
  );
}

/** Equipotential lines: on each triangle, the level crosses two edges linearly (P1). */
function drawContours(
  ctx: CanvasRenderingContext2D,
  mesh: MeshData,
  values: number[],
  levels: number,
  X: (i: number) => number,
  Y: (i: number) => number,
) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!(hi > lo)) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  const t = mesh.triangles;
  for (let k = 1; k < levels; k++) {
    const level = lo + ((hi - lo) * k) / levels;
    ctx.beginPath();
    for (let e = 0; e < t.length / 3; e++) {
      const ids = [t[3 * e], t[3 * e + 1], t[3 * e + 2]];
      const pts: [number, number][] = [];
      for (let i = 0; i < 3; i++) {
        const a = ids[i], b = ids[(i + 1) % 3];
        const va = values[a] - level, vb = values[b] - level;
        if ((va < 0) !== (vb < 0)) {
          const f = va / (va - vb);
          pts.push([X(a) + f * (X(b) - X(a)), Y(a) + f * (Y(b) - Y(a))]);
        }
      }
      if (pts.length === 2) {
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
      }
    }
    ctx.stroke();
  }
}

export default MeshView;
