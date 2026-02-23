/**
 * Tests for field definition management in solverSlice
 */

import { describe, it, expect, beforeEach } from 'vitest';
import solverReducer, {
  addFieldRegion,
  deleteFieldRegion,
  updateFieldRegion,
  updateFieldResult,
  clearFieldRegions,
  setDirectivityRequested,
  setSolverState,
  setCurrentFrequency,
  selectRequestedFields,
  selectDirectivityRequested,
  selectSolverState,
  selectCurrentFrequency,
} from './solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';

const make2DField = (id: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id,
  type: '2D',
  shape: 'plane',
  centerPoint: [0, 0, 50],
  dimensions: { width: 100, height: 100 },
  normalPreset: 'XY',
  sampling: { x: 10, y: 10 },
  fieldType: 'E',
  visible: true,
  ...overrides,
});

const make3DField = (id: string, overrides: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id,
  type: '3D',
  shape: 'sphere',
  centerPoint: [0, 0, 100],
  sphereRadius: 50,
  sampling: { theta: 10, phi: 20, radial: 5 },
  fieldType: 'poynting',
  visible: true,
  ...overrides,
});

describe('solverSlice - Field Definitions', () => {
  let initialState: ReturnType<typeof solverReducer>;

  beforeEach(() => {
    initialState = solverReducer(undefined, { type: '@@INIT' });
  });

  describe('addFieldRegion', () => {
    it('adds a 2D field definition', () => {
      const field = make2DField('field-1');
      const state = solverReducer(initialState, addFieldRegion(field));
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0]).toEqual(field);
    });

    it('adds a 3D field definition', () => {
      const field = make3DField('field-2');
      const state = solverReducer(initialState, addFieldRegion(field));
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0]).toEqual(field);
    });

    it('adds multiple field definitions in order', () => {
      const field1 = make2DField('field-1');
      const field2 = make3DField('field-2');

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));

      expect(state.requestedFields).toHaveLength(2);
      expect(state.requestedFields[0].id).toBe('field-1');
      expect(state.requestedFields[1].id).toBe('field-2');
    });
  });

  describe('deleteFieldRegion', () => {
    it('deletes a field by id', () => {
      const field1 = make2DField('field-1');
      const field2 = make2DField('field-2', { shape: 'ellipse', radiusA: 25, radiusB: 25 } as any);

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));
      state = solverReducer(state, deleteFieldRegion('field-1'));

      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0].id).toBe('field-2');
    });

    it('ignores delete when field does not exist', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(state, deleteFieldRegion('non-existent'));

      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0].id).toBe('field-1');
    });
  });

  describe('updateFieldRegion', () => {
    it('updates field properties', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { sampling: { x: 20, y: 30 }, fieldType: 'H' },
        })
      );

      expect(state.requestedFields[0].sampling).toEqual({ x: 20, y: 30 });
      expect(state.requestedFields[0].fieldType).toBe('H');
    });

    it('does not update when field is missing', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'non-existent',
          updates: { sampling: { x: 99, y: 99 } },
        })
      );

      expect(state.requestedFields[0].sampling).toEqual({ x: 10, y: 10 });
    });

    it('marks field result as outdated when computation-affecting property changes', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      // Simulate a computed field result
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(true);

      // Change dimensions — should mark as outdated
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { dimensions: { width: 200, height: 200 } },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(false);
    });

    it('marks field result as outdated when center point changes', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );

      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { centerPoint: [10, 20, 30] },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(false);
    });

    it('marks field result as outdated when sampling changes', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );

      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { sampling: { x: 50, y: 50 } },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(false);
    });

    it('marks field result as outdated when fieldType changes', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );

      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { fieldType: 'H' },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(false);
    });

    it('marks field result as outdated when normalPreset changes', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );

      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { normalPreset: 'YZ' },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(false);
    });

    it('does NOT mark field result as outdated for cosmetic changes (name, visible, opacity)', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(
        state,
        updateFieldResult({ fieldId: 'field-1', computed: true, num_points: 100 })
      );

      // Name change — cosmetic
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { name: 'Renamed Field' },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(true);

      // Visibility change — cosmetic
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { visible: false },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(true);

      // Opacity change — cosmetic
      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { opacity: 0.8 },
        })
      );
      expect(state.fieldResults!['field-1'].computed).toBe(true);
    });

    it('does nothing if field has no computed result yet', () => {
      const field = make2DField('field-1');

      let state = solverReducer(initialState, addFieldRegion(field));
      // No fieldResults set

      state = solverReducer(
        state,
        updateFieldRegion({
          id: 'field-1',
          updates: { dimensions: { width: 200, height: 200 } },
        })
      );

      // fieldResults should remain null — no crash
      expect(state.fieldResults).toBeNull();
    });
  });

  describe('clearFieldRegions', () => {
    it('clears all field definitions', () => {
      const field1 = make2DField('field-1');
      const field2 = make3DField('field-2');

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));
      state = solverReducer(state, clearFieldRegions());

      expect(state.requestedFields).toHaveLength(0);
    });
  });

  describe('setDirectivityRequested', () => {
    it('toggles directivity requested', () => {
      let state = solverReducer(initialState, setDirectivityRequested(true));
      expect(state.directivityRequested).toBe(true);

      state = solverReducer(state, setDirectivityRequested(false));
      expect(state.directivityRequested).toBe(false);
    });
  });

  describe('setSolverState', () => {
    it('updates solver workflow state', () => {
      let state = solverReducer(initialState, setSolverState('solved'));
      expect(state.solverState).toBe('solved');

      state = solverReducer(state, setSolverState('postprocessing-ready'));
      expect(state.solverState).toBe('postprocessing-ready');

      state = solverReducer(state, setSolverState('idle'));
      expect(state.solverState).toBe('idle');
    });
  });

  describe('setCurrentFrequency', () => {
    it('stores and clears current frequency', () => {
      let state = solverReducer(initialState, setCurrentFrequency(2450));
      expect(state.currentFrequency).toBe(2450);

      state = solverReducer(state, setCurrentFrequency(null));
      expect(state.currentFrequency).toBeNull();
    });
  });

  describe('selectors', () => {
    it('selects requested fields', () => {
      const field = make2DField('field-1');
      const state = solverReducer(initialState, addFieldRegion(field));
      const mockRootState = { solver: state } as any;

      const fields = selectRequestedFields(mockRootState);
      expect(fields).toHaveLength(1);
      expect(fields[0].id).toBe('field-1');
    });

    it('selects directivity requested', () => {
      const state = solverReducer(initialState, setDirectivityRequested(true));
      const mockRootState = { solver: state } as any;
      expect(selectDirectivityRequested(mockRootState)).toBe(true);
    });

    it('selects solver state', () => {
      const state = solverReducer(initialState, setSolverState('solved'));
      const mockRootState = { solver: state } as any;
      expect(selectSolverState(mockRootState)).toBe('solved');
    });

    it('selects current frequency', () => {
      const state = solverReducer(initialState, setCurrentFrequency(2450));
      const mockRootState = { solver: state } as any;
      expect(selectCurrentFrequency(mockRootState)).toBe(2450);
    });
  });
});
