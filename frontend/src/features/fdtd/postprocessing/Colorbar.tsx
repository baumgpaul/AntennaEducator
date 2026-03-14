/**
 * Colorbar — Reusable color scale legend for heatmaps.
 *
 * Renders a vertical gradient bar with min/max labels and optional
 * colormap selection.
 */

import { Box, Typography, Select, MenuItem, type SelectChangeEvent } from '@mui/material'

export type ColormapName = 'viridis' | 'jet' | 'coolwarm' | 'hot' | 'RdBu'

const COLORMAP_STOPS: Record<ColormapName, string[]> = {
  viridis: ['#440154', '#31688e', '#35b779', '#fde725'],
  jet: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'],
  coolwarm: ['#3b4cc0', '#7f9ef3', '#f7f7f7', '#f4a582', '#b40426'],
  hot: ['#000000', '#e50000', '#ffcc00', '#ffffff'],
  RdBu: ['#053061', '#4393c3', '#f7f7f7', '#d6604d', '#67001f'],
}

interface ColorbarProps {
  min: number
  max: number
  label?: string
  colormap?: ColormapName
  onColormapChange?: (cm: ColormapName) => void
  height?: number
}

function Colorbar({
  min,
  max,
  label,
  colormap = 'viridis',
  onColormapChange,
  height = 200,
}: ColorbarProps) {
  const stops = COLORMAP_STOPS[colormap]
  const gradient = stops
    .map((c, i) => `${c} ${(i / (stops.length - 1)) * 100}%`)
    .join(', ')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      {label && (
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      )}
      <Typography variant="caption">{max.toExponential(2)}</Typography>
      <Box
        sx={{
          width: 20,
          height,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          background: `linear-gradient(to bottom, ${gradient})`,
        }}
      />
      <Typography variant="caption">{min.toExponential(2)}</Typography>
      {onColormapChange && (
        <Select
          size="small"
          value={colormap}
          onChange={(e: SelectChangeEvent) => onColormapChange(e.target.value as ColormapName)}
          sx={{ mt: 0.5, fontSize: '0.7rem', '& .MuiSelect-select': { py: 0.25, px: 1 } }}
        >
          <MenuItem value="viridis">Viridis</MenuItem>
          <MenuItem value="jet">Jet</MenuItem>
          <MenuItem value="coolwarm">Coolwarm</MenuItem>
          <MenuItem value="hot">Hot</MenuItem>
          <MenuItem value="RdBu">RdBu</MenuItem>
        </Select>
      )}
    </Box>
  )
}

/** Map a value [min, max] → CSS color using the given colormap. */
export function valueToColor(value: number, min: number, max: number, colormap: ColormapName = 'viridis'): string {
  const stops = COLORMAP_STOPS[colormap]
  const t = max !== min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5
  const idx = t * (stops.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, stops.length - 1)
  const frac = idx - lo
  // Simple hex interpolation
  const parse = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  const [r1, g1, b1] = parse(stops[lo])
  const [r2, g2, b2] = parse(stops[hi])
  const r = Math.round(r1 + (r2 - r1) * frac)
  const g = Math.round(g1 + (g2 - g1) * frac)
  const b = Math.round(b1 + (b2 - b1) * frac)
  return `rgb(${r},${g},${b})`
}

export default Colorbar
