/**
 * Mouse editing on the geometry canvas. The draft model's view is known
 * (jsdom: a 600 × 420 canvas at the origin, fitted to the model), so world
 * coordinates map to pixels exactly.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@/store/authSlice';
import documentationReducer from '@/store/documentationSlice';
import { EMPTY_MODEL, type FemModel } from '../model';

const { meshModel } = vi.hoisted(() => ({ meshModel: vi.fn() }));
vi.mock('../api', async (orig) => ({ ...(await orig<typeof import('../api')>()), meshModel }));
vi.mock('@/features/design/DocumentationPanel', () => ({ default: () => <div>Project documentation</div> }));
import FemStudioPage from '../FemStudioPage';

// a 20 mm × 10 mm plate: fitted, its centre (10, 5) mm is the canvas centre (300, 210) px
const DRAFT: FemModel = { ...EMPTY_MODEL, steps: [{ kind: 'rectangle', name: 'plate', x: 0, y: 0, width: 0.02, height: 0.01 }] };
const SCALE = 0.88 * Math.min(600 / 0.02, 420 / 0.01); // px per m
const at = (x: number, y: number) => ({ clientX: 300 + (x - 0.01) * SCALE, clientY: 210 - (y - 0.005) * SCALE, button: 0, pointerId: 1 });

const saved = () => JSON.parse(localStorage.getItem('fem-studio-model')!) as FemModel;
const canvas = () => screen.getByRole('img', { name: 'Geometry' });
const drag = (from: [number, number], to: [number, number]) => {
  fireEvent.pointerDown(canvas(), at(...from));
  fireEvent.pointerMove(canvas(), at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
  fireEvent.pointerMove(canvas(), at(...to));
  fireEvent.pointerUp(canvas(), at(...to));
};
const click = (p: [number, number]) => {
  fireEvent.pointerDown(canvas(), at(...p));
  fireEvent.pointerUp(canvas(), at(...p));
};

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

describe('geometry canvas editing', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('fem-studio-model', JSON.stringify(DRAFT));
    meshModel.mockReset().mockResolvedValue({ mesh: { nodes: [], triangles: [], triangle_domain: [], domain_names: [], edges: [], boundaries: {}, quality: [], stats: {} }, warnings: [] });
  });

  it('draws a rectangle by dragging, snapped, then selects it', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
    expect(screen.getByText(/Drag from corner to corner/)).toBeInTheDocument();
    drag([0.03, 0.0001], [0.0399, 0.01]); // ends a hair off the grid
    expect(saved().steps[1]).toEqual({ kind: 'rectangle', name: 'rect1', x: 0.03, y: 0, width: 0.01, height: 0.01 });
    expect(screen.queryByText(/Drag from corner to corner/)).not.toBeInTheDocument(); // back to select
    expect(screen.getByLabelText('Name')).toHaveValue('rect1');
  });

  it('snaps to a corner of an existing shape', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
    drag([0.02 + 0.0001, 0.01 - 0.0001], [0.025, 0.01]);
    expect(saved().steps[1]).toMatchObject({ kind: 'circle', cx: 0.02, cy: 0.01, r: 0.005 });
  });

  it('draws a polygon by clicks, finished by a double-click; Escape cancels a drawing', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Polygon' }));
    click([0, 0.02]);
    click([0.01, 0.02]);
    fireEvent.keyDown(window, { key: 'Escape' }); // cancels the clicks, the tool stays
    click([0, 0.02]);
    click([0.01, 0.02]);
    click([0.005, 0.03]);
    fireEvent.doubleClick(canvas());
    expect(saved().steps[1]).toEqual({ kind: 'polygon', name: 'poly1', points: [[0, 0.02], [0.01, 0.02], [0.005, 0.03]] });
  });

  it('drags a shape to move it, and undo/redo put it back and forth', () => {
    render();
    drag([0.005, 0.005], [0.008, 0.005]);
    expect(saved().steps[0]).toMatchObject({ x: 0.003, y: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(saved().steps[0]).toMatchObject({ x: 0, y: 0 });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(saved().steps[0]).toMatchObject({ x: 0.003 });
  });

  it('resizes the selected rectangle by its corner handle, as one undo step', () => {
    render();
    click([0.01, 0.005]); // select
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(4);
    drag([0.02, 0.01], [0.025, 0.015]);
    expect(saved().steps[0]).toMatchObject({ x: 0, y: 0, width: 0.025, height: 0.015 });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(saved().steps[0]).toMatchObject({ width: 0.02, height: 0.01 });
  });

  it('names an edge by clicking it; a second click adds to it', () => {
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Name edges' }));
    click([0.01, 0.0002]);
    expect(saved().selections).toEqual([{ kind: 'points', name: 'edge1', points: [[0.01, 0]] }]);
    click([0.02 - 0.0002, 0.005]);
    expect(saved().selections[0]).toMatchObject({ points: [[0.01, 0], [0.02, 0.005]] });
    click([0.01, 0.005]); // not near an edge: nothing
    expect(saved().selections).toHaveLength(1);
  });

  it('Delete removes the selection, Ctrl+D duplicates', () => {
    render();
    click([0.01, 0.005]);
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(saved().steps[1]).toMatchObject({ kind: 'move', name: 'copy1', objects: ['plate'], keep: true });
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(saved().steps.map((s) => s.name)).toEqual(['plate']);
  });
});
