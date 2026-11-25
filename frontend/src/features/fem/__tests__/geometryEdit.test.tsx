import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/store/authSlice';
import documentationReducer from '@/store/documentationSlice';
import { EMPTY_MODEL, type FemModel, type Step } from '../model';
import { deleteStep, moveStep, renameObject, setControl, uniqueName } from '../geometry/edit';
import { runSequence } from '../geometry/sequence';

const { meshModel } = vi.hoisted(() => ({ meshModel: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), meshModel }));
vi.mock('@/features/design/DocumentationPanel', () => ({ default: () => <div>Project documentation</div> }));
import FemStudioPage from '../FemStudioPage';

const rect = (name: string, x = 0): Step => ({ kind: 'rectangle', name, x, y: 0, width: 1, height: 1 });

const base: FemModel = {
  ...EMPTY_MODEL,
  steps: [rect('a'), rect('b', 0.5), { kind: 'union', name: 'u', objects: ['a', 'b'] }, rect('top', 3)],
  holes: ['top'],
  selections: [{ kind: 'boundary_of', name: 'rim', domains: ['u'] }],
  mesh: { ...EMPTY_MODEL.mesh, controls: [{ target: 'u', size: 0.1 }, { target: 'top|u', size: 0.01 }] },
  materials: { u: { name: 'Air', relative_permittivity: 1 } },
  boundary_conditions: [{ type: 'ground', boundary: 'top|u' }, { type: 'potential', boundary: 'top', value: 1 }],
  sources: [{ type: 'charge_density', domain: 'u', value: 0 }],
};

describe('geometry edits', () => {
  it('renaming follows every reference, also inside interface names (kept sorted)', () => {
    const m = renameObject(base, 'u', 'air');
    expect(m.steps[2].name).toBe('air');
    expect(m.selections[0]).toMatchObject({ domains: ['air'] });
    expect(m.mesh.controls.map((c) => c.target)).toEqual(['air', 'air|top']);
    expect(Object.keys(m.materials)).toEqual(['air']);
    expect(m.boundary_conditions.map((bc) => bc.boundary)).toEqual(['air|top', 'top']);
    expect(m.sources[0].domain).toBe('air');
    expect(runSequence(m).errors).toEqual([]);
    const r = renameObject(base, 'a', 'left');
    expect(r.steps[2]).toMatchObject({ objects: ['left', 'b'] });
  });

  it('deleting a boolean brings its inputs back', () => {
    const m = deleteStep(base, 2);
    expect(runSequence(m).objects.map((o) => o.name)).toEqual(['a', 'b', 'top']);
    expect(m.mesh.controls.map((c) => c.target)).toEqual(['top|u']);
  });

  it('deleting an input leaves the boolean with the rest', () => {
    const m = deleteStep(base, 0);
    expect(m.steps[1]).toMatchObject({ objects: ['b'] });
    expect(runSequence(m).stepErrors.u).toMatch(/at least 2/);
  });

  it('moving a step changes the painter order; a reference before its object is an error', () => {
    expect(runSequence(moveStep(base, 3, -1)).objects.map((o) => o.name)).toEqual(['top', 'u']);
    expect(runSequence(moveStep(base, 2, -1)).stepErrors.u).toMatch(/not an object/);
  });

  it('mesh controls are merged, and removed when empty', () => {
    let m = setControl(base, 'rim', { divisions: 20 });
    expect(m.mesh.controls.at(-1)).toEqual({ target: 'rim', divisions: 20 });
    m = setControl(m, 'rim', { grading: 2 });
    expect(m.mesh.controls.at(-1)).toEqual({ target: 'rim', divisions: 20, grading: 2 });
    m = setControl(m, 'rim', { divisions: null });
    expect(m.mesh.controls.find((c) => c.target === 'rim')).toBeUndefined();
    expect(uniqueName('rect', ['rect1', 'rect2'])).toBe('rect3');
  });
});

describe('Geometry tab', () => {
  beforeEach(() => {
    localStorage.clear();
    meshModel.mockReset().mockResolvedValue({ mesh: { nodes: [], triangles: [], triangle_domain: [], domain_names: [], edges: [], boundaries: {}, quality: [], stats: {} }, warnings: [] });
  });

  const render = () => {
    const store = configureStore({ reducer: { auth: authReducer, documentation: documentationReducer } });
    return rtlRender(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/fem']}>
          <FemStudioPage />
        </MemoryRouter>
      </Provider>,
    );
  };
  const tree = () => screen.getByRole('tree', { name: 'Geometry tree' });
  /** A shape tool, then Enter: its default shape (the keyboard path) */
  const insert = (label: string) => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.keyDown(window, { key: 'Enter' });
  };

  it('adds shapes, combines the selection and edits the result in its properties', () => {
    render();
    // combining needs a selection
    expect(screen.getByRole('button', { name: 'Union' })).toBeDisabled();
    insert('Rectangle');
    insert('Circle');
    expect(within(tree()).getAllByRole('treeitem').map((t) => t.getAttribute('aria-label'))).toEqual(['rect1', 'circle1']);

    // the new circle is selected: ctrl-click adds the rectangle
    fireEvent.click(within(tree()).getByRole('treeitem', { name: 'rect1' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Union' }));
    const top = within(tree()).getAllByRole('treeitem');
    expect(top.map((t) => t.getAttribute('aria-label'))).toEqual(['uni1']);
    fireEvent.click(within(tree()).getByRole('button', { name: 'Expand uni1' }));
    expect(within(tree()).getAllByRole('treeitem').map((t) => t.getAttribute('aria-label'))).toEqual(['uni1', 'circle1', 'rect1']);

    // properties of the union: rename it, set its mesh
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'body' } });
    expect(within(tree()).getByRole('treeitem', { name: 'body' })).toBeInTheDocument();
    expect(screen.getByText('The domain takes this name')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('structured'));
    const saved = JSON.parse(localStorage.getItem('fem-studio-model')!) as FemModel;
    expect(saved.steps.at(-1)).toMatchObject({ kind: 'union', name: 'body', objects: ['circle1', 'rect1'] });
    expect(saved.mesh.controls).toEqual([{ target: 'body', structured: true }]);

    // deleting the union brings its inputs back, in their order
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(within(tree()).getAllByRole('treeitem').map((t) => t.getAttribute('aria-label'))).toEqual(['rect1', 'circle1']);
  });

  it('shows what is wrong with a step in the tree', () => {
    render();
    insert('Rectangle');
    fireEvent.change(screen.getByLabelText('width [m]'), { target: { value: '-1' } });
    expect(within(tree()).getByLabelText('Error in rect1')).toBeInTheDocument();
    expect(screen.getAllByText(/width must be positive/).length).toBeGreaterThan(0);
  });
});
