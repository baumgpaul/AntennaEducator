import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { meshModel } = vi.hoisted(() => ({ meshModel: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), meshModel }));

import FemStudioPage from '../FemStudioPage';

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
      '1 Geometry', '2 Materials', '3 Physics', '4 Mesh', '5 Solve', '6 Results',
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

  it('template → find domains → the Materials tab opens with the domain', async () => {
    render(<FemStudioPage />);
    fireEvent.mouseDown(screen.getByLabelText('Start from'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Coaxial cable'));
    expect(screen.getByText(/2πε\/ln\(b\/a\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Find domains & boundaries/ }));
    await waitFor(() => expect(screen.getByText('Domains:')).toBeInTheDocument());
    expect(meshModel).toHaveBeenCalledTimes(1);
    expect(meshModel.mock.calls[0][0].shapes.map((s: { name: string }) => s.name)).toEqual(['dielectric', 'inner']);

    fireEvent.click(screen.getByRole('tab', { name: /Materials/ }));
    expect(screen.getByText('Material of each domain')).toBeInTheDocument();
    expect(screen.getByTitle('dielectric')).toBeInTheDocument();
  });
});
