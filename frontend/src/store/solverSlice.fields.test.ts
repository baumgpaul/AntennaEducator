/**
 * Tests for field definition management in solverSlice
 */

import { describe, it, expect, beforeEach } from 'vitest';
import solverReducer, {
  addFieldRegion,
  deleteFieldRegion,
  updateFieldRegion,
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

describe('solverSlice - Field Definitions', () => {
  let initialState: ReturnType<typeof solverReducer>;

  beforeEach(() => {
    initialState = solverReducer(undefined, { type: '@@INIT' });
  });

  describe('addFieldRegion', () => {
    it('should add a 2D field definition', () => {
      const field: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      const state = solverReducer(initialState, addFieldRegion(field));
      
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0]).toEqual(field);
    });

    it('should add a 3D field definition', () => {
      const field: FieldDefinition = {
        id: 'field-2',
        regionType: '3D',
        shape: 'sphere',
        fieldTypes: ['E-field', 'Poynting'],
        radialSampling: 5,
        angularSampling: 20,
        nearFar: 'far',
      };

      const state = solverReducer(initialState, addFieldRegion(field));
      
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0]).toEqual(field);
    });

    it('should add multiple field definitions', () => {
      const field1: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'circle',
        fieldTypes: ['E-field'],
        samplingX: 15,
        samplingY: 15,
        nearFar: 'near',
      };

      const field2: FieldDefinition = {
        id: 'field-2',
        regionType: '3D',
        shape: 'cube',
        fieldTypes: ['H-field'],
        radialSampling: 8,
        angularSampling: 16,
        nearFar: 'far',
      };

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));
      
      expect(state.requestedFields).toHaveLength(2);
      expect(state.requestedFields[0].id).toBe('field-1');
      expect(state.requestedFields[1].id).toBe('field-2');
    });
  });

  describe('deleteFieldRegion', () => {
    it('should delete a field by id', () => {
      const field1: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      const field2: FieldDefinition = {
        id: 'field-2',
        regionType: '2D',
        shape: 'circle',
        fieldTypes: ['H-field'],
        samplingX: 12,
        samplingY: 12,
        nearFar: 'far',
      };

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));
      state = solverReducer(state, deleteFieldRegion('field-1'));
      
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0].id).toBe('field-2');
    });

    it('should handle deleting non-existent field', () => {
      const field: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(state, deleteFieldRegion('non-existent'));
      
      expect(state.requestedFields).toHaveLength(1);
      expect(state.requestedFields[0].id).toBe('field-1');
    });
  });

  describe('updateFieldRegion', () => {
    it('should update field properties', () => {
      const field: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(state, updateFieldRegion({
        id: 'field-1',
        updates: { samplingX: 20, fieldTypes: ['E-field', 'H-field'] },
      }));
      
      expect(state.requestedFields[0].samplingX).toBe(20);
      expect(state.requestedFields[0].fieldTypes).toEqual(['E-field', 'H-field']);
    });

    it('should not update non-existent field', () => {
      const field: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      let state = solverReducer(initialState, addFieldRegion(field));
      state = solverReducer(state, updateFieldRegion({
        id: 'non-existent',
        updates: { samplingX: 20 },
      }));
      
      expect(state.requestedFields[0].samplingX).toBe(10);
    });
  });

  describe('clearFieldRegions', () => {
    it('should clear all field definitions', () => {
      const field1: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      const field2: FieldDefinition = {
        id: 'field-2',
        regionType: '3D',
        shape: 'sphere',
        fieldTypes: ['Poynting'],
        radialSampling: 5,
        angularSampling: 20,
        nearFar: 'far',
      };

      let state = solverReducer(initialState, addFieldRegion(field1));
      state = solverReducer(state, addFieldRegion(field2));
      state = solverReducer(state, clearFieldRegions());
      
      expect(state.requestedFields).toHaveLength(0);
    });
  });

  describe('setDirectivityRequested', () => {
    it('should set directivity requested to true', () => {
      const state = solverReducer(initialState, setDirectivityRequested(true));
      expect(state.directivityRequested).toBe(true);
    });

    it('should set directivity requested to false', () => {
      let state = solverReducer(initialState, setDirectivityRequested(true));
      state = solverReducer(state, setDirectivityRequested(false));
      expect(state.directivityRequested).toBe(false);
    });
  });

  describe('setSolverState', () => {
    it('should set solver state to solved', () => {
      const state = solverReducer(initialState, setSolverState('solved'));
      expect(state.solverState).toBe('solved');
    });

    it('should set solver state to postprocessing-ready', () => {
      const state = solverReducer(initialState, setSolverState('postprocessing-ready'));
      expect(state.solverState).toBe('postprocessing-ready');
    });

    it('should reset solver state to idle', () => {
      let state = solverReducer(initialState, setSolverState('solved'));
      state = solverReducer(state, setSolverState('idle'));
      expect(state.solverState).toBe('idle');
    });
  });

  describe('setCurrentFrequency', () => {
    it('should set current frequency', () => {
      const state = solverReducer(initialState, setCurrentFrequency(2450));
      expect(state.currentFrequency).toBe(2450);
    });

    it('should clear current frequency', () => {
      let state = solverReducer(initialState, setCurrentFrequency(2450));
      state = solverReducer(state, setCurrentFrequency(null));
      expect(state.currentFrequency).toBeNull();
    });
  });

  describe('selectors', () => {
    it('should select requested fields', () => {
      const field: FieldDefinition = {
        id: 'field-1',
        regionType: '2D',
        shape: 'plane',
        fieldTypes: ['E-field'],
        samplingX: 10,
        samplingY: 10,
        nearFar: 'near',
      };

      const state = solverReducer(initialState, addFieldRegion(field));
      const mockRootState = { solver: state } as any;
      
      const fields = selectRequestedFields(mockRootState);
      expect(fields).toHaveLength(1);
      expect(fields[0].id).toBe('field-1');
    });

    it('should select directivity requested', () => {
      const state = solverReducer(initialState, setDirectivityRequested(true));
      const mockRootState = { solver: state } as any;
      
      expect(selectDirectivityRequested(mockRootState)).toBe(true);
    });

    it('should select solver state', () => {
      const state = solverReducer(initialState, setSolverState('solved'));
      const mockRootState = { solver: state } as any;
      
      expect(selectSolverState(mockRootState)).toBe('solved');
    });

    it('should select current frequency', () => {
      const state = solverReducer(initialState, setCurrentFrequency(2450));
      const mockRootState = { solver: state } as any;
      
      expect(selectCurrentFrequency(mockRootState)).toBe(2450);
    });
  });
});
