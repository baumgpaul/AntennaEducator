import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { MeshData } from '../api';
import { colorOf, colormap } from './geometryDraw';
import { findTriangle } from './meshGeometry';

export interface MeshViewProps {
  mesh: MeshData;
  /** Per-triangle values (coloured with the colour map); default: domain colours */
  triangleValues?: number[];
  /** Per-node values for contour lines (e.g. the potential) */
  contours?: { values: number[]; levels: number };
  /** Per-triangle vectors (e.g. E) drawn as arrows on a coarse sample */
  arrows?: number[];
  showEdges?: boolean;
  highlightBoundaries?: string[];
  selectedTriangle?: number | null;
  onPickTriangle?: (index: number) => void;
  /** Pixels, or 'fill' to take the height of the parent (a flex column) */
  height?: number | 'fill';
}

/** Canvas renderer for meshes and fields (y up, aspect ratio kept). */
function MeshView({
  mesh,
  triangleValues,
  contours,
  arrows,
  showEdges = true,
  highlightBoundaries = [],
  selectedTriangle,
  onPickTriangle,
  height = 420,
}: MeshViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // the canvas size in CSS pixels, followed as the layout changes
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
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

  const range = useMemo(() => {
    if (!triangleValues?.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (const v of triangleValues) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [triangleValues]);

  // world → canvas transform, recomputed on draw
  const transform = useRef({ s: 1, ox: 0, oy: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = size?.w || canvas.clientWidth || 600;
    const ch = height === 'fill' ? size?.h || canvas.clientHeight || 420 : height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const pad = 12;
    const w = bounds.xmax - bounds.xmin || 1;
    const h = bounds.ymax - bounds.ymin || 1;
    const s = Math.min((cw - 2 * pad) / w, (ch - 2 * pad) / h);
    const ox = pad + (cw - 2 * pad - s * w) / 2 - s * bounds.xmin;
    const oy = pad + (ch - 2 * pad - s * h) / 2 + s * bounds.ymax;
    transform.current = { s, ox, oy };
    const X = (i: number) => ox + s * mesh.nodes[2 * i];
    const Y = (i: number) => oy - s * mesh.nodes[2 * i + 1];
    const t = mesh.triangles;
    const nTri = t.length / 3;

    for (let e = 0; e < nTri; e++) {
      const [a, b, c] = [t[3 * e], t[3 * e + 1], t[3 * e + 2]];
      ctx.beginPath();
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
      ctx.lineTo(X(c), Y(c));
      ctx.closePath();
      ctx.fillStyle =
        triangleValues && range
          ? colormap((triangleValues[e] - range.lo) / (range.hi - range.lo))
          : colorOf(mesh.triangle_domain[e]);
      ctx.fill();
      if (showEdges && nTri < 20000) {
        ctx.strokeStyle = triangleValues ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = ctx.fillStyle; // close hairline gaps
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    if (contours) drawContours(ctx, mesh, contours.values, contours.levels, X, Y);
    if (arrows) drawArrows(ctx, mesh, arrows, X, Y, s, bounds);

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
      const e = selectedTriangle;
      ctx.beginPath();
      ctx.moveTo(X(t[3 * e]), Y(t[3 * e]));
      ctx.lineTo(X(t[3 * e + 1]), Y(t[3 * e + 1]));
      ctx.lineTo(X(t[3 * e + 2]), Y(t[3 * e + 2]));
      ctx.closePath();
      ctx.strokeStyle = '#d32f2f';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }, [mesh, triangleValues, range, contours, arrows, showEdges, highlightBoundaries, selectedTriangle, height, bounds, size]);

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPickTriangle) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const { s, ox, oy } = transform.current;
    const x = (ev.clientX - rect.left - ox) / s;
    const y = (oy - (ev.clientY - rect.top)) / s;
    const e = findTriangle(mesh, x, y);
    if (e >= 0) onPickTriangle(e);
  };

  return (
    <Box sx={height === 'fill' ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } : undefined}>
      <canvas
        ref={ref}
        onClick={onClick}
        style={{
          width: '100%',
          height: height === 'fill' ? undefined : height,
          flex: height === 'fill' ? '1 1 0' : undefined,
          minHeight: 0,
          display: 'block',
          cursor: onPickTriangle ? 'crosshair' : undefined,
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

/** E-field arrows on a sample of triangles (direction; length ∝ log of magnitude). */
function drawArrows(
  ctx: CanvasRenderingContext2D,
  mesh: MeshData,
  vectors: number[],
  X: (i: number) => number,
  Y: (i: number) => number,
  scale: number,
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number },
) {
  const t = mesh.triangles;
  const n = t.length / 3;
  const cell = Math.max(bounds.xmax - bounds.xmin, bounds.ymax - bounds.ymin) / 18;
  const taken = new Set<string>();
  let max = 0;
  for (let e = 0; e < n; e++) max = Math.max(max, Math.hypot(vectors[2 * e], vectors[2 * e + 1]));
  if (!(max > 0)) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.2;
  for (let e = 0; e < n; e++) {
    const ids = [t[3 * e], t[3 * e + 1], t[3 * e + 2]];
    const cx = ids.reduce((s, i) => s + mesh.nodes[2 * i], 0) / 3;
    const cy = ids.reduce((s, i) => s + mesh.nodes[2 * i + 1], 0) / 3;
    const key = `${Math.floor(cx / cell)},${Math.floor(cy / cell)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    const ex = vectors[2 * e], ey = vectors[2 * e + 1];
    const mag = Math.hypot(ex, ey);
    if (mag < 1e-3 * max) continue;
    const len = cell * scale * 0.8 * (0.35 + 0.65 * Math.log1p((9 * mag) / max) / Math.log(10));
    const px = ids.reduce((s, i) => s + X(i), 0) / 3;
    const py = ids.reduce((s, i) => s + Y(i), 0) / 3;
    const dx = (ex / mag) * len, dy = (-ey / mag) * len; // canvas y is down
    ctx.beginPath();
    ctx.moveTo(px - dx / 2, py - dy / 2);
    ctx.lineTo(px + dx / 2, py + dy / 2);
    ctx.stroke();
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(px + dx / 2, py + dy / 2);
    ctx.lineTo(px + dx / 2 - 5 * Math.cos(ang - 0.45), py + dy / 2 - 5 * Math.sin(ang - 0.45));
    ctx.lineTo(px + dx / 2 - 5 * Math.cos(ang + 0.45), py + dy / 2 - 5 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }
}

export default MeshView;
