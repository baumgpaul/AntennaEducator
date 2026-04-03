import { configureStore } from '@reduxjs/toolkit';
import designReducer, {
  addElement,
  setElementCircuit,
  addSourceToElement,
  addLumpedElementToElement,
} from '../designSlice';
import type { AntennaElement, Source, LumpedElement } from '@/types/models';
import { describe, it, expect, beforeEach } from 'vitest';

type TestRootState = {
  design: ReturnType<typeof designReducer>;
};

describe('designSlice — setElementCircuit', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  const mockElement: AntennaElement = {
    id: 'elem-1',
    type: 'dipole',
    name: 'Test Dipole',
    config: { length: 0.5, wire_radius: 0.01, segments: 10 },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: {
      nodes: [[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]],
      edges: [[0, 1], [1, 2]],
      radii: [0.01, 0.01],
    },
    visible: true,
    locked: false,
  };

  const mockElement2: AntennaElement = {
    ...mockElement,
    id: 'elem-2',
    name: 'Test Loop',
    type: 'loop',
  };

  const voltageSource: Source = {
    type: 'voltage',
    amplitude: 1.0,
    node_start: 1,
    node_end: 2,
  };

  const resistor: LumpedElement = {
    type: 'resistor',
    R: 50,
    L: 0,
    C_inv: 0,
    node_start: 1,
    node_end: 2,
  };

  beforeEach(() => {
    store = configureStore({ reducer: { design: designReducer } });
  });

  it('replaces sources and lumped_elements on the target element', () => {
    store.dispatch(addElement(mockElement));

    const newSources: Source[] = [
      { type: 'voltage', amplitude: 2.0, node_start: 1, node_end: 3 },
    ];
    const newLumped: LumpedElement[] = [
      { type: 'capacitor', R: 0, L: 0, C_inv: 1e12, node_start: 2, node_end: 3 },
    ];

    store.dispatch(setElementCircuit({
      elementId: 'elem-1',
      sources: newSources,
      lumped_elements: newLumped,
      appended_nodes: [{ index: -1, label: 'Aux1' }],
    }));

    const el = store.getState().design.elements[0];
    expect(el.sources).toHaveLength(1);
    expect(el.sources![0].amplitude).toBe(2.0);
    expect(el.lumped_elements).toHaveLength(1);
    expect(el.lumped_elements![0].type).toBe('capacitor');
    expect(el.appended_nodes).toEqual([{ index: -1, label: 'Aux1' }]);
  });

  it('marks design as unsolved', () => {
    store.dispatch(addElement(mockElement));

    store.dispatch(setElementCircuit({
      elementId: 'elem-1',
      sources: [voltageSource],
      lumped_elements: [],
      appended_nodes: [],
    }));

    expect(store.getState().design.isSolved).toBe(false);
  });

  it('updates global sources array for backward compatibility', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));

    // Add a source to elem-2 via legacy action
    store.dispatch(addSourceToElement({ elementId: 'elem-2', source: voltageSource }));
    expect(store.getState().design.sources).toHaveLength(1);

    // Use circuit editor on elem-1
    const newSources: Source[] = [
      { type: 'current', amplitude: 0.5, node_start: 1, node_end: 2 },
    ];
    store.dispatch(setElementCircuit({
      elementId: 'elem-1',
      sources: newSources,
      lumped_elements: [resistor],
      appended_nodes: [],
    }));

    // Global arrays should have sources from both elements
    expect(store.getState().design.sources).toHaveLength(2);
    expect(store.getState().design.lumpedElements).toHaveLength(1);
  });

  it('clears circuit when given empty arrays', () => {
    store.dispatch(addElement(mockElement));

    // First add some circuit data
    store.dispatch(setElementCircuit({
      elementId: 'elem-1',
      sources: [voltageSource],
      lumped_elements: [resistor],
      appended_nodes: [{ index: -1, label: 'N1' }],
    }));

    // Then clear it
    store.dispatch(setElementCircuit({
      elementId: 'elem-1',
      sources: [],
      lumped_elements: [],
      appended_nodes: [],
    }));

    const el = store.getState().design.elements[0];
    expect(el.sources).toEqual([]);
    expect(el.lumped_elements).toEqual([]);
    expect(el.appended_nodes).toEqual([]);
  });

  it('does nothing for non-existent element ID', () => {
    store.dispatch(addElement(mockElement));

    store.dispatch(setElementCircuit({
      elementId: 'non-existent',
      sources: [voltageSource],
      lumped_elements: [],
      appended_nodes: [],
    }));

    const el = store.getState().design.elements[0];
    expect(el.sources).toBeUndefined();
  });
});
