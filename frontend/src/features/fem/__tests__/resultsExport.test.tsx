import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SolveResult } from '../api';
import { EPSILON_0, TEMPLATES, type FemModel, type FemView } from '../model';
import type { FemStudio } from '../useFemStudio';

const { downloadFile, buildFemReport, save } = vi.hoisted(() => {
  const save = vi.fn();
  return { downloadFile: vi.fn(), buildFemReport: vi.fn(() => ({ save })), save };
});
vi.mock('@/utils/exportData', async (orig) => ({ ...(await orig<typeof import('@/utils/exportData')>()), downloadFile }));
vi.mock('../results/femReport', () => ({ buildFemReport }));
vi.mock('../results/fieldImage', () => ({ potentialImage: () => null }));

import ResultsTab from '../tabs/ResultsTab';

const RESULT = {
  mesh: {
    nodes: [-1, -1, 1, -1, 1, 1, -1, 1], triangles: [0, 1, 2, 0, 2, 3], triangle_domain: [0, 0], domain_names: ['air'],
    edges: [], boundaries: {}, quality: [1, 1],
    stats: { nodes: 4, triangles: 2, domains: {}, boundaries: {}, quality: { min: 1, mean: 1, histogram: [], bin_edges: [] } },
  },
  potential: [0, 0, 1, 1], electric_field: [0, -0.5, 0, -0.5], flux_density: [0, 0, 0, 0],
  permittivity: { air: EPSILON_0 }, capacitance: null, charge: {}, charge_from_flux: {}, energy: 1, energy_by_domain: {}, depth: 1,
} as unknown as SolveResult;

const line: FemView = { id: 'l', name: 'Probe', type: 'line', quantity: 'potential', start: [0, -0.9], end: [0, 0.9] };
const study: FemView = { id: 'c', name: 'Convergence', type: 'convergence', quantity: 'energy', steps: 5 };

function studio(views: FemView[]): FemStudio {
  const model: FemModel = { ...TEMPLATES[0].model, name: 'Plate capacitor', views };
  return {
    model, result: { key: 'k', data: RESULT }, issues: [], busy: null, error: null, saveStatus: 'saved',
    project: { name: 'My plates', fromCourse: false, hasDocs: false },
    progress: { done: new Set(['results']), attention: new Set(), notes: {}, domains: [], boundaries: [] },
    update: vi.fn(), load: vi.fn(), runMesh: vi.fn(), runSolve: vi.fn(), exportFiles: vi.fn(),
  } as unknown as FemStudio;
}

describe('FEM results: exports', () => {
  beforeEach(() => {
    downloadFile.mockReset();
    buildFemReport.mockClear();
    save.mockReset();
  });

  it('ParaView and CSV of the selected line probe download files named after the model', () => {
    render(<ResultsTab studio={studio([line, study])} />);
    fireEvent.click(screen.getByRole('button', { name: 'ParaView' }));
    expect(downloadFile).toHaveBeenLastCalledWith(expect.stringContaining('<VTKFile type="UnstructuredGrid"'), 'Plate_capacitor-solution.vtu', 'application/xml');
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(downloadFile).toHaveBeenLastCalledWith(expect.stringMatching(/^s \[m\],x \[m\],y \[m\],V \[V\] FEM/), 'Plate_capacitor-Probe.csv', 'text/csv;charset=utf-8');
  });

  it('CSV is off for a study that has not run', () => {
    render(<ResultsTab studio={studio([study, line])} />);
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
  });

  it('the PDF report gets the project name, the result and whether it is current', async () => {
    render(<ResultsTab studio={studio([line])} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF report' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Plate_capacitor-report.pdf'));
    expect(buildFemReport).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'My plates', result: { data: RESULT, current: true }, fieldImage: null }),
    );
  });
});
