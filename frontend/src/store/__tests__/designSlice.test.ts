import { configureStore } from '@reduxjs/toolkit';
import designReducer, {
  addElement,
  updateElement,
  removeElement,
  duplicateElement,
  setElementVisibility,
  setElementLocked,
  setElementColor,
} from '../designSlice';
import type { AntennaElement } from '@/types/models';
import { describe, it, expect, beforeEach } from 'vitest';

type TestRootState = {
  design: ReturnType<typeof designReducer>;
};

describe('designSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  // Mock antenna element for testing
  const mockElement: AntennaElement = {
    id: 'test-dipole-1',
    type: 'dipole',
    name: 'Test Dipole',
    config: {
      length: 0.5,
      wire_radius: 0.01,
      segments: 20,
    },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    mesh: {
      nodes: [[0, 0, 0], [0, 0, 0.5]],
      edges: [[0, 1]],
      radii: [0.01],
    },
    visible: true,
    locked: false,
    color: '#FF8C00',
  };

  const mockElement2: AntennaElement = {
    ...mockElement,
    id: 'test-loop-1',
    type: 'loop',
    name: 'Test Loop',
    color: '#00CED1',
  };

  beforeEach(() => {
    store = configureStore({
      reducer: {
        design: designReducer,
      },
    });
  });

  // ============================================================================
  // ADD ELEMENT
  // ============================================================================

  it('addElement should add a new antenna element to the store', () => {
    store.dispatch(addElement(mockElement));
    const state = store.getState().design;

    expect(state.elements).toHaveLength(1);
    expect(state.elements[0]).toEqual(mockElement);
    expect(state.elements[0].id).toBe('test-dipole-1');
    expect(state.elements[0].name).toBe('Test Dipole');
  });

  it('addElement should add multiple elements', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));
    const state = store.getState().design;

    expect(state.elements).toHaveLength(2);
    expect(state.elements[0].type).toBe('dipole');
    expect(state.elements[1].type).toBe('loop');
  });

  // ============================================================================
  // UPDATE ELEMENT
  // ============================================================================

  it('updateElement should modify an existing element', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(updateElement({
      id: 'test-dipole-1',
      updates: {
        name: 'Updated Dipole',
        config: { length: 0.75, radius: 0.01, segments: 20 },
      },
    }));
    const state = store.getState().design;

    expect(state.elements[0].name).toBe('Updated Dipole');
    expect((state.elements[0].config as any).length).toBe(0.75);
    expect(state.elements[0].id).toBe('test-dipole-1'); // ID should not change
  });

  it('updateElement should handle partial updates', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(updateElement({
      id: 'test-dipole-1',
      updates: { name: 'New Name' },
    }));
    const state = store.getState().design;

    expect(state.elements[0].name).toBe('New Name');
    expect(state.elements[0].type).toBe('dipole'); // Unchanged
    expect(state.elements[0].visible).toBe(true); // Unchanged
  });

  it('updateElement should not affect other elements', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));
    store.dispatch(updateElement({
      id: 'test-dipole-1',
      updates: { name: 'Modified Dipole' },
    }));
    const state = store.getState().design;

    expect(state.elements[0].name).toBe('Modified Dipole');
    expect(state.elements[1].name).toBe('Test Loop'); // Unchanged
  });

  // ============================================================================
  // REMOVE ELEMENT
  // ============================================================================

  it('removeElement should delete an element by id', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));
    store.dispatch(removeElement('test-dipole-1'));
    const state = store.getState().design;

    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].id).toBe('test-loop-1');
  });

  it('removeElement should handle removing non-existent element gracefully', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(removeElement('non-existent-id'));
    const state = store.getState().design;

    expect(state.elements).toHaveLength(1); // Original element still there
    expect(state.elements[0].id).toBe('test-dipole-1');
  });

  // ============================================================================
  // DUPLICATE ELEMENT
  // ============================================================================

  it('duplicateElement should create a copy with new id', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(duplicateElement('test-dipole-1'));
    const state = store.getState().design;

    expect(state.elements).toHaveLength(2);
    expect(state.elements[1].type).toBe('dipole'); // Same type
    expect(state.elements[1].name).toContain('Test Dipole'); // Same base name
    expect(state.elements[1].id).not.toBe('test-dipole-1'); // Different ID
  });

  it('duplicateElement should preserve configuration with spatial offset', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(duplicateElement('test-dipole-1'));
    const state = store.getState().design;
    const duplicate = state.elements[1];

    // Same configuration
    expect(duplicate.type).toBe('dipole');
    expect(duplicate.rotation).toEqual(mockElement.rotation);
    expect(duplicate.config).toEqual(mockElement.config);
    expect(duplicate.visible).toBe(mockElement.visible);
    expect(duplicate.locked).toBe(mockElement.locked);
    
    // Position slightly offset (0.1m in X) for spatial separation
    expect(duplicate.position[1]).toBe(mockElement.position[1]); // Y same
    expect(duplicate.position[2]).toBe(mockElement.position[2]); // Z same
    expect(duplicate.position[0]).toBeGreaterThan(mockElement.position[0]); // X offset
  });

  it('duplicateElement should not affect original element', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(duplicateElement('test-dipole-1'));
    const state = store.getState().design;

    expect(state.elements[0]).toEqual(mockElement); // Original unchanged
  });

  // ============================================================================
  // VISIBILITY TOGGLE
  // ============================================================================

  it('setElementVisibility should toggle element visibility', () => {
    store.dispatch(addElement(mockElement));
    expect(store.getState().design.elements[0].visible).toBe(true);

    store.dispatch(setElementVisibility({ id: 'test-dipole-1', visible: false }));
    expect(store.getState().design.elements[0].visible).toBe(false);

    store.dispatch(setElementVisibility({ id: 'test-dipole-1', visible: true }));
    expect(store.getState().design.elements[0].visible).toBe(true);
  });

  it('setElementVisibility should not affect other elements', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));

    store.dispatch(setElementVisibility({ id: 'test-dipole-1', visible: false }));
    const state = store.getState().design;

    expect(state.elements[0].visible).toBe(false);
    expect(state.elements[1].visible).toBe(true); // Unchanged
  });

  // ============================================================================
  // LOCK TOGGLE
  // ============================================================================

  it('setElementLocked should toggle lock state', () => {
    store.dispatch(addElement(mockElement));
    expect(store.getState().design.elements[0].locked).toBe(false);

    store.dispatch(setElementLocked({ id: 'test-dipole-1', locked: true }));
    expect(store.getState().design.elements[0].locked).toBe(true);

    store.dispatch(setElementLocked({ id: 'test-dipole-1', locked: false }));
    expect(store.getState().design.elements[0].locked).toBe(false);
  });

  it('setElementLocked should not affect other elements', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));

    store.dispatch(setElementLocked({ id: 'test-dipole-1', locked: true }));
    const state = store.getState().design;

    expect(state.elements[0].locked).toBe(true);
    expect(state.elements[1].locked).toBe(false); // Unchanged
  });

  // ============================================================================
  // COLOR ASSIGNMENT
  // ============================================================================

  it('setElementColor should update element color', () => {
    store.dispatch(addElement(mockElement));
    store.dispatch(setElementColor({ id: 'test-dipole-1', color: '#FF0000' }));
    const state = store.getState().design;

    expect(state.elements[0].color).toBe('#FF0000');
  });

  // ============================================================================
  // MULTI-ELEMENT SCENARIOS
  // ============================================================================

  it('should handle complex multi-element workflows', () => {
    // Create 3 elements
    store.dispatch(addElement(mockElement));
    store.dispatch(addElement(mockElement2));
    store.dispatch(addElement({ ...mockElement, id: 'test-rod-1', type: 'rod' }));

    // Duplicate first element
    store.dispatch(duplicateElement('test-dipole-1'));
    expect(store.getState().design.elements).toHaveLength(4);

    // Lock first element
    store.dispatch(setElementLocked({ id: 'test-dipole-1', locked: true }));
    expect(store.getState().design.elements[0].locked).toBe(true);

    // Hide second element
    store.dispatch(setElementVisibility({ id: 'test-loop-1', visible: false }));
    expect(store.getState().design.elements[1].visible).toBe(false);

    // Rename third element
    store.dispatch(updateElement({
      id: 'test-rod-1',
      updates: { name: 'Modified Rod' },
    }));
    expect(store.getState().design.elements[2].name).toBe('Modified Rod');

    // Delete duplicate
    const duplicateId = store.getState().design.elements[3].id;
    store.dispatch(removeElement(duplicateId));
    expect(store.getState().design.elements).toHaveLength(3);
  });

  it('should maintain element integrity through sequential operations', () => {
    // Add element
    store.dispatch(addElement(mockElement));

    // Update position
    store.dispatch(updateElement({
      id: 'test-dipole-1',
      updates: { position: [1, 2, 3] },
    }));

    // Toggle visibility
    store.dispatch(setElementVisibility({ id: 'test-dipole-1', visible: false }));

    // Toggle lock
    store.dispatch(setElementLocked({ id: 'test-dipole-1', locked: true }));

    const final = store.getState().design.elements[0];
    expect(final.id).toBe('test-dipole-1');
    expect(final.position).toEqual([1, 2, 3]);
    expect(final.visible).toBe(false);
    expect(final.locked).toBe(true);
    expect(final.type).toBe('dipole'); // Unchanged
    expect(final.name).toBe('Test Dipole'); // Unchanged
  });
});
