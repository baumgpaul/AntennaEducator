/**
 * Axis configs of a line plot. Items created without them (ribbon "Add Curve",
 * older projects) and right-axis traces get defaults derived from the traces
 * and the sweep, so a plot never falls back to a bare "X" axis in raw Hz.
 */
import type { AxisConfig, PlotTrace } from '@/types/plotDefinitions';

export interface SweepContext {
  /** First swept variable of a parameter study, if any. */
  paramSweepVariable?: string | null;
  /** A frequency sweep result exists. */
  frequencySweep: boolean;
}

const FREQUENCY_VARIABLES = new Set(['freq', 'frequency']);

/** Default x-axis for a trace source and sweep. */
export function defaultXAxis(source: string, ctx: SweepContext): AxisConfig {
  if (source === 'distribution') return { label: 'Segment Index', unit: '', scale: 'linear' };
  if (source === 'farfield') return { label: 'θ', unit: '°', scale: 'linear' };
  if (source === 'field') return { label: 'Distance', unit: 'm', scale: 'linear' };
  if (ctx.paramSweepVariable) {
    const unit = FREQUENCY_VARIABLES.has(ctx.paramSweepVariable) ? 'Hz' : '';
    return { label: ctx.paramSweepVariable, unit, scale: 'linear' };
  }
  // Port quantities without a parameter sweep are plotted over frequency
  if (ctx.frequencySweep || source === 'port') return { label: 'Frequency', unit: 'Hz', scale: 'linear' };
  return { label: 'X', unit: '', scale: 'linear' };
}

/** Default y-axis from the first trace on that axis. */
export function defaultYAxis(traces: PlotTrace[]): AxisConfig {
  const first = traces[0];
  if (!first) return { label: 'Y', unit: '', scale: 'linear' };
  const q = first.quantity;
  switch (q.source) {
    case 'port': {
      if (q.quantity.startsWith('impedance')) return { label: 'Impedance', unit: 'Ω', scale: 'linear' };
      if (q.quantity === 'return_loss') return { label: 'Return Loss', unit: 'dB', scale: 'linear' };
      if (q.quantity === 'vswr') return { label: 'VSWR', unit: '', scale: 'linear' };
      if (q.quantity.startsWith('reflection')) return { label: '|Γ|', unit: '', scale: 'linear' };
      return { label: first.label, unit: '', scale: 'linear' };
    }
    case 'distribution': {
      if (q.quantity.startsWith('current')) return { label: 'Current', unit: 'A', scale: 'linear' };
      if (q.quantity.startsWith('voltage')) return { label: 'Voltage', unit: 'V', scale: 'linear' };
      return { label: first.label, unit: '', scale: 'linear' };
    }
    case 'farfield':
      return { label: first.label, unit: 'dBi', scale: 'linear' };
    default:
      return { label: first.label, unit: '', scale: 'linear' };
  }
}

interface LinePlotAxes {
  traces?: PlotTrace[];
  xAxisConfig?: AxisConfig;
  yAxisLeftConfig?: AxisConfig;
  yAxisRightConfig?: AxisConfig;
}

/** The axes to draw: the item's own configs, defaults where they are missing. */
export function resolveLineAxes(
  item: LinePlotAxes,
  ctx: SweepContext,
): { x: AxisConfig; left: AxisConfig; right?: AxisConfig } {
  const traces = item.traces ?? [];
  const left = traces.filter((t) => t.yAxisId !== 'right');
  const right = traces.filter((t) => t.yAxisId === 'right');
  return {
    x: item.xAxisConfig ?? defaultXAxis(traces[0]?.quantity.source ?? 'port', ctx),
    left: item.yAxisLeftConfig ?? defaultYAxis(left.length > 0 ? left : traces),
    right: right.length > 0 ? (item.yAxisRightConfig ?? defaultYAxis(right)) : item.yAxisRightConfig,
  };
}
