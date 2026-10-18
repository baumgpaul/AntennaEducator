import { describe, it, expect } from 'vitest';
import { axisHeader, buildResultsJSON, safeFilename, tracesToCSV } from '../exportData';
import type { PlotTrace } from '@/types/plotDefinitions';

const trace = (id: string, label: string) =>
  ({ id, label, color: '#000', lineStyle: 'solid', yAxisId: 'left', quantity: {} }) as unknown as PlotTrace;

describe('tracesToCSV', () => {
  it('merges traces on x and leaves gaps empty', () => {
    const csv = tracesToCSV(
      [trace('a', 'Re(Z)'), trace('b', 'Im(Z)')],
      {
        a: [{ x: 300, y: 73.1 }, { x: 200, y: 20 }],
        b: [{ x: 300, y: -3.9 }],
      },
      'Frequency [MHz]',
    );
    expect(csv).toBe('Frequency [MHz],Re(Z),Im(Z)\n200,20,\n300,73.1,-3.9\n');
  });

  it('quotes cells with commas or quotes and blanks non-finite values', () => {
    const csv = tracesToCSV(
      [trace('a', 'VSWR, "port 1"')],
      { a: [{ x: 1, y: Infinity }] },
      'x',
    );
    expect(csv).toBe('x,"VSWR, ""port 1"""\n1,\n');
  });
});

describe('helpers', () => {
  it('axisHeader adds the unit', () => {
    expect(axisHeader({ label: 'Frequency', unit: 'MHz' }, 'x')).toBe('Frequency [MHz]');
    expect(axisHeader(undefined, 'x')).toBe('x');
  });

  it('safeFilename strips unsafe characters', () => {
    expect(safeFilename('Impedance / VSWR (port 1)')).toBe('Impedance_VSWR_port_1');
    expect(safeFilename('///')).toBe('export');
  });
});

describe('buildResultsJSON', () => {
  it('includes sweep and study results but not mesh snapshots', () => {
    const json = JSON.parse(
      buildResultsJSON(
        {
          solver: {
            solveMode: 'sweep',
            frequencySweep: { frequencies: [1e8], results: [{ frequency: 1e8 }] },
            parameterStudy: {
              config: { sweepVariables: [] },
              results: [
                { point: { L: 0.5 }, solverResponse: { ok: 1 }, converged: true, meshSnapshots: ['big'] } as never,
              ],
            },
          },
        },
        { id: 'p1', name: 'Dipole' },
      ),
    );
    expect(json.format).toBe('antenna-educator-results');
    expect(json.project).toEqual({ id: 'p1', name: 'Dipole' });
    expect(json.frequency_sweep.frequencies).toEqual([1e8]);
    expect(json.parameter_study.results[0]).toEqual({ point: { L: 0.5 }, solverResponse: { ok: 1 }, converged: true });
  });
});
