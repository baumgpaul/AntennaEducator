/**
 * Tests for trace source compatibility logic in LineViewPanel / AddCurveDialog.
 *
 * When a line-plot view already contains traces, adding new traces from a
 * different source type (e.g. port vs distribution) should be blocked because
 * they have incompatible x-axes.
 */
import { describe, it, expect } from 'vitest';
import type { ViewItem } from '@/types/postprocessing';

// ─── Pure-logic replicas of the aggregation from LineViewPanel ─────────────

type SourceType = 'port' | 'distribution' | 'farfield' | 'field';

interface AggregationResult {
  existingTraceCount: number;
  existingTraceSource: SourceType | null;
  existingTraceMixed: boolean;
}

function aggregateTraceSources(items: ViewItem[]): AggregationResult {
  const allLinePlotItems = items.filter((item) => item.type === 'line-plot');
  let existingTraceCount = 0;
  const existingSources = new Set<string>();
  for (const it of allLinePlotItems) {
    const traces = it.traces ?? [];
    existingTraceCount += traces.length;
    for (const t of traces) {
      if (t?.quantity?.source) existingSources.add(t.quantity.source);
    }
  }
  const existingTraceSource: SourceType | null =
    existingSources.size === 1
      ? (Array.from(existingSources)[0] as SourceType)
      : null;
  const existingTraceMixed = existingSources.size > 1;
  return { existingTraceCount, existingTraceSource, existingTraceMixed };
}

// ─── Incompatibility check from AddCurveDialog ────────────────────────────

function isSourceIncompatible(
  optType: SourceType,
  existingTraceSource: SourceType | null,
  existingTraceMixed: boolean,
): boolean {
  if (existingTraceMixed) return true;
  return existingTraceSource != null && optType !== existingTraceSource;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Trace source aggregation', () => {
  it('returns null source and count 0 for empty items', () => {
    const result = aggregateTraceSources([]);
    expect(result.existingTraceCount).toBe(0);
    expect(result.existingTraceSource).toBeNull();
    expect(result.existingTraceMixed).toBe(false);
  });

  it('returns null source for items without line-plot type', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'polar-plot', label: 'Polar', visible: true },
    ];
    const result = aggregateTraceSources(items);
    expect(result.existingTraceCount).toBe(0);
    expect(result.existingTraceSource).toBeNull();
  });

  it('returns port source when all traces are port', () => {
    const items: ViewItem[] = [
      {
        id: '1',
        type: 'line-plot',
        label: 'Z(f)',
        visible: true,
        traces: [
          { id: 't1', quantity: { source: 'port', quantity: 'impedance_real' }, label: 'Re(Z)', color: '#f00', lineStyle: 'solid', yAxisId: 'left' },
          { id: 't2', quantity: { source: 'port', quantity: 'impedance_imag' }, label: 'Im(Z)', color: '#00f', lineStyle: 'solid', yAxisId: 'left' },
        ],
      },
    ];
    const result = aggregateTraceSources(items);
    expect(result.existingTraceCount).toBe(2);
    expect(result.existingTraceSource).toBe('port');
    expect(result.existingTraceMixed).toBe(false);
  });

  it('detects mixed sources across multiple line-plot items', () => {
    const items: ViewItem[] = [
      {
        id: '1',
        type: 'line-plot',
        label: 'Z(f)',
        visible: true,
        traces: [
          { id: 't1', quantity: { source: 'port', quantity: 'impedance_real' }, label: 'Re(Z)', color: '#f00', lineStyle: 'solid', yAxisId: 'left' },
        ],
      },
      {
        id: '2',
        type: 'line-plot',
        label: 'I(z)',
        visible: true,
        traces: [
          { id: 't2', quantity: { source: 'distribution', quantity: 'current_mag' }, label: '|I|', color: '#0f0', lineStyle: 'solid', yAxisId: 'left' },
        ],
      },
    ];
    const result = aggregateTraceSources(items);
    expect(result.existingTraceCount).toBe(2);
    expect(result.existingTraceSource).toBeNull(); // mixed → null
    expect(result.existingTraceMixed).toBe(true);
  });

  it('handles line-plot items with no traces gracefully', () => {
    const items: ViewItem[] = [
      { id: '1', type: 'line-plot', label: 'Empty', visible: true },
    ];
    const result = aggregateTraceSources(items);
    expect(result.existingTraceCount).toBe(0);
    expect(result.existingTraceSource).toBeNull();
    expect(result.existingTraceMixed).toBe(false);
  });
});

describe('Source incompatibility check', () => {
  it('allows any source when no existing traces', () => {
    expect(isSourceIncompatible('port', null, false)).toBe(false);
    expect(isSourceIncompatible('distribution', null, false)).toBe(false);
    expect(isSourceIncompatible('farfield', null, false)).toBe(false);
  });

  it('allows same source type', () => {
    expect(isSourceIncompatible('port', 'port', false)).toBe(false);
    expect(isSourceIncompatible('distribution', 'distribution', false)).toBe(false);
  });

  it('blocks different source type', () => {
    expect(isSourceIncompatible('distribution', 'port', false)).toBe(true);
    expect(isSourceIncompatible('port', 'farfield', false)).toBe(true);
    expect(isSourceIncompatible('field', 'port', false)).toBe(true);
  });

  it('blocks all sources when traces are already mixed', () => {
    expect(isSourceIncompatible('port', null, true)).toBe(true);
    expect(isSourceIncompatible('distribution', null, true)).toBe(true);
    expect(isSourceIncompatible('farfield', null, true)).toBe(true);
    expect(isSourceIncompatible('field', null, true)).toBe(true);
  });
});
