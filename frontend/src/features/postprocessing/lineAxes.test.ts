import { describe, it, expect } from 'vitest';
import { resolveLineAxes } from './lineAxes';
import type { PlotTrace } from '@/types/plotDefinitions';

const trace = (quantity: string, yAxisId: 'left' | 'right' = 'left', source = 'port'): PlotTrace =>
  ({
    id: quantity,
    quantity: { source, quantity },
    label: quantity,
    color: '#000',
    lineStyle: 'solid',
    yAxisId,
  }) as unknown as PlotTrace;

const freqSweep = { paramSweepVariable: 'freq', frequencySweep: false };

describe('resolveLineAxes', () => {
  it('fills in a frequency x-axis for an item created without axis configs', () => {
    const { x } = resolveLineAxes({ traces: [trace('impedance_real')] }, freqSweep);
    expect(x).toEqual({ label: 'freq', unit: 'Hz', scale: 'linear' });
  });

  it('uses frequency for port quantities of a single solve (was a bare "X" in raw Hz)', () => {
    const { x } = resolveLineAxes({ traces: [trace('impedance_real')] }, { frequencySweep: false });
    expect(x).toEqual({ label: 'Frequency', unit: 'Hz', scale: 'linear' });
  });

  it('labels a geometric sweep variable without a unit', () => {
    const { x } = resolveLineAxes({ traces: [trace('impedance_real')] }, { paramSweepVariable: 'L', frequencySweep: false });
    expect(x).toEqual({ label: 'L', unit: '', scale: 'linear' });
  });

  it('gives right-axis traces their own axis', () => {
    const axes = resolveLineAxes({ traces: [trace('impedance_real'), trace('vswr', 'right')] }, freqSweep);
    expect(axes.left).toEqual({ label: 'Impedance', unit: 'Ω', scale: 'linear' });
    expect(axes.right).toEqual({ label: 'VSWR', unit: '', scale: 'linear' });
  });

  it('builds the left axis from left traces only', () => {
    const axes = resolveLineAxes({ traces: [trace('vswr', 'right'), trace('return_loss')] }, freqSweep);
    expect(axes.left.label).toBe('Return Loss');
  });

  it('has no right axis without right-axis traces', () => {
    expect(resolveLineAxes({ traces: [trace('vswr')] }, freqSweep).right).toBeUndefined();
  });

  it('keeps axis configs the user has set', () => {
    const mine = { label: 'f', unit: 'Hz', scale: 'log' as const };
    expect(resolveLineAxes({ traces: [trace('vswr')], xAxisConfig: mine }, freqSweep).x).toBe(mine);
  });
});
