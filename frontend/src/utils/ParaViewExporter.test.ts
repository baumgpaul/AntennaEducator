import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildVtu, canExportToVTU, exportToVTU, fieldDataTarget } from './ParaViewExporter';
import type { RootState } from '@/store';

const { downloadFile } = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock('./exportData', () => ({ downloadFile }));

const c = (real: number, imag = 0) => ({ real, imag });
const FIELD = {
  points: [
    [0, 0, 0],
    [1, 0, 0],
  ] as Array<[number, number, number]>,
  E_mag: [2, 0.5],
  H_mag: [0.01, 0.002],
  E_vectors: [
    { x: c(0), y: c(0), z: c(2, 1) },
    { x: c(0.5), y: c(0), z: c(0) },
  ],
  H_vectors: [
    { x: c(0), y: c(0.01), z: c(0) },
    { x: c(0), y: c(0), z: c(0.002) },
  ],
};

const array = (vtu: string, name: string) =>
  vtu.match(new RegExp(`Name="${name}"[^>]*>\\s*([^<]*)<`))?.[1].trim().split(/\s+/).map(Number);

describe('buildVtu', () => {
  it('writes the computed fields, not zeros', () => {
    const vtu = buildVtu(FIELD, 3e8);
    expect(array(vtu, 'E_Magnitude')).toEqual([2, 0.5]);
    expect(array(vtu, 'E_Field_Real')).toEqual([0, 0, 2, 0.5, 0, 0]);
    expect(array(vtu, 'E_Field_Imag')).toEqual([0, 0, 1, 0, 0, 0]);
    expect(array(vtu, 'Points')).toEqual([0, 0, 0, 1, 0, 0]);
    expect(array(vtu, 'Frequency_MHz')).toEqual([300]);
  });

  it('is a valid point cloud: one vertex cell per point', () => {
    const vtu = buildVtu(FIELD, 3e8);
    expect(vtu).toContain('NumberOfPoints="2" NumberOfCells="2"');
    expect(array(vtu, 'connectivity')).toEqual([0, 1]);
    expect(array(vtu, 'offsets')).toEqual([1, 2]);
    expect(array(vtu, 'types')).toEqual([1, 1]); // VTK_VERTEX
    expect(vtu).not.toContain('format="binary"');
  });

  it('leaves out arrays that do not match the points', () => {
    const vtu = buildVtu({ points: FIELD.points, E_mag: [1] }, 3e8);
    expect(vtu).not.toContain('E_Magnitude');
  });
});

describe('exportToVTU', () => {
  let state: RootState;
  beforeEach(() => {
    downloadFile.mockReset();
    state = { solver: { fieldData: { field1: { 300000000: FIELD } } } } as unknown as RootState;
  });

  it('downloads the VTU without calling the backend', async () => {
    await exportToVTU({ fieldId: 'field1', frequencyHz: 300000000, filename: 'near' }, state);
    const [content, name, mime] = downloadFile.mock.calls[0];
    expect(name).toBe('near.vtu');
    expect(mime).toBe('application/xml');
    expect(content).toContain('<VTKFile type="UnstructuredGrid"');
  });

  it('explains missing data', async () => {
    await expect(
      exportToVTU({ fieldId: 'nope', frequencyHz: 300000000, filename: 'x' }, state),
    ).rejects.toThrow(/No field data/);
  });

  it('canExportToVTU reflects available data', () => {
    expect(canExportToVTU('field1', 300000000, state)).toBe(true);
    expect(canExportToVTU('field1', 400000000, state)).toBe(false);
  });

  it('reads sweep data by point index but writes the point frequency', async () => {
    const sweepState = { solver: { fieldData: { field1: { 2: FIELD } } } } as unknown as RootState;
    await exportToVTU({ fieldId: 'field1', key: 2, frequencyHz: 4e8, filename: 'pt' }, sweepState);
    const [content] = downloadFile.mock.calls[0];
    expect(array(content, 'Frequency_MHz')).toEqual([400]);
  });
});

describe('fieldDataTarget', () => {
  const study = {
    config: { sweepVariables: [{ variableName: 'freq' }] },
    results: [
      { point: { values: { freq: 2e8 } }, solverResponse: { frequency: 2e8 } },
      { point: { values: { freq: 4e8 } }, solverResponse: { frequency: 4e8 } },
    ],
  };

  it('single solve: keyed by frequency in Hz', () => {
    expect(fieldDataTarget({ solveMode: 'single', currentFrequency: 300 })).toEqual({
      key: 3e8,
      frequencyHz: 3e8,
      label: '300.00MHz',
    });
  });

  it('parameter sweep: keyed by the selected sweep point, with that point frequency', () => {
    const target = fieldDataTarget({
      solveMode: 'sweep',
      currentFrequency: 300,
      parameterStudy: study,
      selectedSweepPointIndex: 1,
    });
    expect(target).toEqual({ key: 1, frequencyHz: 4e8, label: 'freq_4e+8' });
  });

  it('nothing solved: no target', () => {
    expect(fieldDataTarget({ solveMode: null, currentFrequency: null })).toBeNull();
  });
});
