import { Box, Typography } from '@mui/material';
import type { Bounds, Drawn } from './geometryDraw';
import { colorOf, si } from './geometryDraw';

interface Props {
  shapes: Drawn[];
  bounds: Bounds;
  holes: string[];
  selected?: string | null;
  onSelect?: (name: string) => void;
  /** Colour per shape name (e.g. by material); default: by shape order */
  fill?: Record<string, string>;
  /** Pixels, or 'fill' to take the height of the parent (a flex column) */
  height?: number | 'fill';
}

/** The geometry as drawn: later shapes on top (they win where shapes overlap), holes hatched. */
function GeometryView({ shapes, bounds, holes, selected, onSelect, fill, height = 420 }: Props) {
  const w = bounds.xmax - bounds.xmin || 1;
  const h = bounds.ymax - bounds.ymin || 1;
  const pad = 0.06 * Math.max(w, h);
  const vb = [bounds.xmin - pad, -(bounds.ymax + pad), w + 2 * pad, h + 2 * pad];
  const stroke = Math.max(w, h) / 400;

  return (
    <Box sx={{ position: 'relative', ...(height === 'fill' ? { flex: 1, minHeight: 0 } : {}) }}>
      <svg
        viewBox={vb.join(' ')}
        style={{ width: '100%', height: height === 'fill' ? '100%' : height, display: 'block', background: 'var(--mui-palette-background-default, #fafafa)' }}
        role="img"
        aria-label="Geometry"
      >
        <defs>
          <pattern id="fem-hatch" patternUnits="userSpaceOnUse" width={stroke * 8} height={stroke * 8} patternTransform="rotate(45)">
            <rect width={stroke * 8} height={stroke * 8} fill="#ddd" />
            <line x1={0} y1={0} x2={0} y2={stroke * 8} stroke="#888" strokeWidth={stroke * 2} />
          </pattern>
        </defs>
        {/* y up: flip */}
        <g transform="scale(1,-1)">
          {shapes.map((s, i) => {
            const isHole = holes.includes(s.name);
            const common = {
              fill: isHole ? 'url(#fem-hatch)' : (fill?.[s.name] ?? colorOf(i)),
              fillOpacity: isHole ? 1 : 0.55,
              stroke: s.name === selected ? '#d32f2f' : '#333',
              strokeWidth: s.name === selected ? stroke * 3 : stroke,
              style: { cursor: onSelect ? 'pointer' : undefined },
              onClick: onSelect ? () => onSelect(s.name) : undefined,
            };
            if (s.kind === 'rect') return <rect key={s.name} {...common} x={s.x} y={s.y} width={Math.max(s.w, 0)} height={Math.max(s.h, 0)} />;
            if (s.kind === 'circle') return <circle key={s.name} {...common} cx={s.cx} cy={s.cy} r={Math.max(s.r, 0)} />;
            return <polygon key={s.name} {...common} points={s.points.map((p) => p.join(',')).join(' ')} />;
          })}
        </g>
      </svg>
      <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', left: 8, bottom: 4 }}>
        {si(w, 'm', 3)} × {si(h, 'm', 3)}
      </Typography>
    </Box>
  );
}

export default GeometryView;
