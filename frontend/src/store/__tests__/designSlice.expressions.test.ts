import { configureStore } from '@reduxjs/toolkit';
import designReducer, {
  addElement,
  updateElement,
} from '../designSlice';
import type { AntennaElement } from '@/types/models';
import { describe, it, expect, beforeEach } from 'vitest';

type TestRootState = {
  design: ReturnType<typeof designReducer>;
};

describe('designSlice — expression persistence', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  const mockDipole: AntennaElement = {
    id: 'dipole-expr-1',
    type: 'dipole',
    name: 'Test Dipole',
    config: {
      length: 0.4993,
      wire_radius: 0.001,
      gap: 0.01,
      segments: 20,
    },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: {
      nodes: [[0, 0, 0], [0, 0, 0.5]],
      edges: [[0, 1]],
      radii: [0.001],
    },
    visible: true,
    locked: false,
    color: '#FF8C00',
    expressions: {
      length: 'wavelength / 2',
      radius: '0.001',
      gap: 'wavelength / 100',
    },
  };

  const mockLoop: AntennaElement = {
    id: 'loop-expr-1',
    type: 'loop',
    name: 'Test Loop',
    config: {
      radius: 0.1,
      wire_radius: 0.001,
      gap: 0.005,
      segments: 16,
    },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: {
      nodes: [[0.1, 0, 0], [0, 0.1, 0]],
      edges: [[0, 1]],
      radii: [0.001],
    },
    visible: true,
    locked: false,
    color: '#00CED1',
    expressions: {
      radius: 'wavelength / (2 * pi)',
      wireRadius: '0.001',
      feedGap: '0.005',
    },
  };

  const mockElementNoExpr: AntennaElement = {
    id: 'dipole-no-expr',
    type: 'dipole',
    name: 'Plain Dipole',
    config: { length: 0.5, wire_radius: 0.01, segments: 10 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: { nodes: [], edges: [], radii: [] },
    visible: true,
    locked: false,
    color: '#4169E1',
  };

  beforeEach(() => {
    store = configureStore({
      reducer: { design: designReducer },
    });
  });

  it('should store expressions on an element', () => {
    store.dispatch(addElement(mockDipole));
    const el = store.getState().design.elements[0];
    expect(el.expressions).toBeDefined();
    expect(el.expressions?.length).toBe('wavelength / 2');
    expect(el.expressions?.radius).toBe('0.001');
    expect(el.expressions?.gap).toBe('wavelength / 100');
  });

  it('should allow elements without expressions', () => {
    store.dispatch(addElement(mockElementNoExpr));
    const el = store.getState().design.elements[0];
    expect(el.expressions).toBeUndefined();
  });

  it('should preserve expressions through updateElement', () => {
    store.dispatch(addElement(mockDipole));
    store.dispatch(
      updateElement({
        id: 'dipole-expr-1',
        updates: { name: 'Renamed Dipole' },
      })
    );
    const el = store.getState().design.elements[0];
    expect(el.name).toBe('Renamed Dipole');
    expect(el.expressions?.length).toBe('wavelength / 2');
  });

  it('should update expressions through updateElement', () => {
    store.dispatch(addElement(mockDipole));
    store.dispatch(
      updateElement({
        id: 'dipole-expr-1',
        updates: {
          expressions: {
            length: 'wavelength / 4',
            radius: '0.002',
            gap: 'wavelength / 50',
          },
        },
      })
    );
    const el = store.getState().design.elements[0];
    expect(el.expressions?.length).toBe('wavelength / 4');
    expect(el.expressions?.radius).toBe('0.002');
  });

  it('should store loop expressions with correct keys', () => {
    store.dispatch(addElement(mockLoop));
    const el = store.getState().design.elements[0];
    expect(el.expressions?.radius).toBe('wavelength / (2 * pi)');
    expect(el.expressions?.wireRadius).toBe('0.001');
    expect(el.expressions?.feedGap).toBe('0.005');
  });

  it('should handle multiple elements with different expression states', () => {
    store.dispatch(addElement(mockDipole));
    store.dispatch(addElement(mockElementNoExpr));
    store.dispatch(addElement(mockLoop));

    const elements = store.getState().design.elements;
    expect(elements).toHaveLength(3);
    expect(elements[0].expressions).toBeDefined();
    expect(elements[1].expressions).toBeUndefined();
    expect(elements[2].expressions).toBeDefined();
  });
});
