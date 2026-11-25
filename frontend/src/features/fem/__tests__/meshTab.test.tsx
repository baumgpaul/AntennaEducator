import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/store/authSlice';
import documentationReducer from '@/store/documentationSlice';
import { TEMPLATES, type FemModel } from '../model';
import type { MeshData } from '../api';

const { meshModel } = vi.hoisted(() => ({ meshModel: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), meshModel }));
vi.mock('@/features/design/DocumentationPanel', () => ({ default: () => <div>Project documentation</div> }));
import FemStudioPage from '../FemStudioPage';

// two triangles and a quad; the second triangle is flat (poor)
const MESH: MeshData = {
  nodes: [0, 0, 1, 0, 0, 1, 1, 1, 2, 0, 2, 1, 0.5, 0.01],
  triangles: [0, 1, 2, 0, 1, 6],
  triangle_domain: [0, 0],
  quads: [1, 4, 5, 3],
  quad_domain: [0],
  domain_names: ['dielectric'],
  edges: [0, 1, 1, 4],
  boundaries: { inner: [0], outer: [1] },
  quality: [0.87, 0.02, 1],
  min_angle: [45, 1.1, 90],
  aspect: [1.2, 40, 1],
  stats: {
    nodes: 7, triangles: 2, quads: 1, elements: 3,
    domains: { dielectric: 3 }, boundaries: { inner: 1, outer: 1 },
    quality: { min: 0.02, mean: 0.63, histogram: [1, 0, 0, 0, 0, 0, 0, 0, 1, 1], bin_edges: [] },
    angles: { min: 1.1, max: 177 }, aspect: { max: 40, mean: 14 },
  },
};

const saved = () => JSON.parse(localStorage.getItem('fem-studio-model')!) as FemModel;

function render() {
  const store = configureStore({ reducer: { auth: authReducer, documentation: documentationReducer } });
  return rtlRender(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/fem']}>
        <FemStudioPage />
      </MemoryRouter>
    </Provider>,
  );
}

describe('Mesh tab', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('fem-studio-model', JSON.stringify(TEMPLATES.find((t) => t.id === 'coax')!.model));
    meshModel.mockReset().mockResolvedValue({ mesh: MESH, warnings: [] });
  });

  it('element type and order: quads and order 2 are marked export only, and Solve is off', async () => {
    render();
    await waitFor(() => expect(meshModel).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /Mesh/ }));
    expect(screen.queryByText(/export only/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quadrilaterals' }));
    expect(saved().mesh.element).toBe('quad');
    expect(screen.getByText(/export only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate mesh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /up to date/ })).toBeInTheDocument());
    expect(screen.getByText(/1 quadrilaterals/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Solve/ }));
    expect(screen.getByRole('button', { name: /solve/i })).toBeDisabled();
    expect(screen.getAllByText(/needs linear triangles/).length).toBeGreaterThan(0);
  });

  it('shows the quality measures and counts the poor elements', async () => {
    render();
    await waitFor(() => expect(meshModel).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /Mesh/ }));
    // the template's mesh is current (found on open)
    await waitFor(() => expect(screen.getByText(/angles 1\.1° … 177\.0°/)).toBeInTheDocument());
    expect(screen.getByText('Poor elements (q < 0.3)')).toBeInTheDocument();
    expect(screen.getByLabelText('1')).not.toBeDisabled(); // the switch, labelled with the count
    fireEvent.click(screen.getByRole('button', { name: 'Smallest angle' }));
    fireEvent.click(screen.getByRole('button', { name: /Show worst/ }));
  });

  it('a boundary layer is set on a boundary in the local refinements', async () => {
    render();
    await waitFor(() => expect(meshModel).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('tab', { name: /Mesh/ }));
    fireEvent.mouseDown(screen.getByLabelText('Refine at…'));
    fireEvent.click(await screen.findByRole('option', { name: 'inner (boundary)' }));
    fireEvent.click(screen.getByLabelText('boundary layer'));
    expect(saved().mesh.controls.at(-1)).toMatchObject({ target: 'inner', boundary_layer: { growth: 1.2, layers: 5 } });
    fireEvent.change(screen.getByLabelText('layers'), { target: { value: '8' } });
    expect(saved().mesh.controls.at(-1)!.boundary_layer!.layers).toBe(8);
  });
});
