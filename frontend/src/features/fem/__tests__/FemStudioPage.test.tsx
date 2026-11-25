import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '@/store/authSlice';
import documentationReducer from '@/store/documentationSlice';

const { meshModel, getProject, updateProject } = vi.hoisted(() => ({
  meshModel: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
}));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), meshModel }));
vi.mock('@/api/projects', () => ({ getProject, updateProject }));
// The rich-text editor is not needed here
vi.mock('@/features/design/DocumentationPanel', () => ({ default: () => <div>Project documentation</div> }));

import FemStudioPage from '../FemStudioPage';
import { TEMPLATES } from '../model';
import { meshKey, shapesKey } from '../studioState';

function render(ui: React.ReactElement, path = '/fem') {
  const store = configureStore({ reducer: { auth: authReducer, documentation: documentationReducer } });
  return rtlRender(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fem" element={ui} />
          <Route path="/project/:projectId/fem" element={ui} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

const COAX_MESH = {
  nodes: [0, 0, 1, 0, 0, 1],
  triangles: [0, 1, 2],
  triangle_domain: [0],
  domain_names: ['dielectric'],
  edges: [0, 1, 1, 2],
  boundaries: { inner: [0], outer: [1] },
  quality: [0.9],
  stats: { nodes: 3, triangles: 1, domains: { dielectric: 1 }, boundaries: { inner: 1, outer: 1 }, quality: { min: 0.9, mean: 0.9, histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], bin_edges: [] } },
};

describe('FemStudioPage', () => {
  beforeEach(() => {
    localStorage.clear();
    meshModel.mockReset().mockResolvedValue({ mesh: COAX_MESH, warnings: [] });
  });

  it('shows the six workflow tabs with the Learn panel of the active step', () => {
    render(<FemStudioPage />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Geometry', 'Materials', 'Physics', 'Mesh', 'Solve', 'Results',
    ]);
    expect(screen.getByText('Learn: Geometry')).toBeInTheDocument();
  });

  it('explains why a later step is locked, and Next leads back', () => {
    render(<FemStudioPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Mesh/ }));
    expect(screen.getByText('Learn: Mesh')).toBeInTheDocument();
    expect(screen.getByText(/opens once Physics/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next: Geometry/ }));
    expect(screen.getByText('Learn: Geometry')).toBeInTheDocument();
  });

  it('choosing a template finds its domains right away → the Materials tab opens with the domain', async () => {
    render(<FemStudioPage />);
    fireEvent.mouseDown(screen.getByLabelText('Start from'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Coaxial cable'));
    expect(screen.getByText(/2πε\/ln\(b\/a\)/)).toBeInTheDocument();

    // no click on "Find domains & boundaries" needed
    await waitFor(() => expect(screen.getByText('Domains:')).toBeInTheDocument());
    expect(meshModel).toHaveBeenCalledTimes(1);
    expect(meshModel.mock.calls[0][0].steps.map((s: { name: string }) => s.name)).toEqual(['dielectric', 'inner']);

    fireEvent.click(screen.getByRole('tab', { name: /Materials/ }));
    expect(screen.getByText('Material of each domain')).toBeInTheDocument();
    expect(screen.getByTitle('dielectric')).toBeInTheDocument();
  });

  it('opens a saved FEM project with its documentation, and saves changes', async () => {
    const coax = TEMPLATES.find((t) => t.id === 'coax')!.model;
    getProject.mockResolvedValue({ id: 'p1', name: 'My coax', kind: 'fem', design_state: coax, source_project_id: 'course-1' });
    updateProject.mockResolvedValue({});
    render(<FemStudioPage />, '/project/p1/fem');

    await waitFor(() => expect(screen.getByText(/My coax · 2D electrostatics/)).toBeInTheDocument());
    expect(screen.getByText('Saved')).toBeInTheDocument();
    // a course copy opens on its documentation
    expect(screen.getByText('Project documentation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Learn' }));
    expect(screen.getByText('Learn: Geometry')).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('Value')[0], { target: { value: '0.0006' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    const modelSave = () => updateProject.mock.calls.find(([, b]) => b.design_state);
    await waitFor(() => expect(modelSave()).toBeDefined(), { timeout: 3000 });
    const [id, body] = modelSave()!;
    expect(id).toBe('p1');
    expect(body.design_state.parameters.a).toBe(0.0006);
    expect(body.design_state.name).toBe('My coax');
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });

  it('a project without a saved mesh finds its domains on open and saves them with the project', async () => {
    const coax = TEMPLATES.find((t) => t.id === 'coax')!.model;
    getProject.mockResolvedValue({ id: 'p2', name: 'New coax', kind: 'fem', design_state: coax });
    updateProject.mockReset().mockResolvedValue({});
    render(<FemStudioPage />, '/project/p2/fem');

    await waitFor(() => expect(meshModel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const [id, body] = updateProject.mock.calls.at(-1)!;
    expect(id).toBe('p2');
    expect(body).not.toHaveProperty('design_state');
    expect(body.simulation_results.femResult.mesh).toMatchObject({ key: meshKey(coax), shapesKey: shapesKey(coax) });
    expect(body.simulation_results.femResult.mesh.data.domain_names).toEqual(['dielectric']);
    fireEvent.click(screen.getByRole('tab', { name: /Materials/ }));
    expect(screen.getByText('Material of each domain')).toBeInTheDocument();
  });

  it('opens a project with its saved mesh: no locked steps and no new mesh', async () => {
    const coax = TEMPLATES.find((t) => t.id === 'coax')!.model;
    const femResult = { version: 1, mesh: { key: meshKey(coax), shapesKey: shapesKey(coax), warnings: [], data: COAX_MESH } };
    getProject.mockResolvedValue({ id: 'p3', name: 'Saved coax', kind: 'fem', design_state: coax, simulation_results: { femResult } });
    updateProject.mockReset().mockResolvedValue({});
    render(<FemStudioPage />, '/project/p3/fem');

    await waitFor(() => expect(screen.getByText('Domains:')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Materials/ }));
    expect(screen.getByText('Material of each domain')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(meshModel).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled(); // restoring is not a change
  });
});
