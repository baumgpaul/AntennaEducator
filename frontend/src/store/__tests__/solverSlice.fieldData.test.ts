import { configureStore } from '@reduxjs/toolkit';
import solverReducer, {
  setFieldData,
  clearFieldData,
  clearFieldDataForField,
  selectFieldData,
} from '../solverSlice';
import designReducer from '../designSlice';
import type { FieldData } from '../solverSlice';

describe('solverSlice field data management', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        solver: solverReducer,
        design: designReducer,
      },
    });
  });

  const makeMockFieldData = (size: number = 10): FieldData => ({
    points: Array.from({ length: size }, (_, i) => [i, 0, 0]),
    E_mag: Array.from({ length: size }, (_, i) => i * 0.1),
    H_mag: Array.from({ length: size }, (_, i) => i * 0.05),
    E_vectors: Array.from({ length: size }, () => [1, 0, 0]),
    H_vectors: Array.from({ length: size }, () => [0, 1, 0]),
  });

  describe('setFieldData', () => {
    it('stores field data for a specific field and frequency', () => {
      const fieldData = makeMockFieldData(10);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData,
      }));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData).toHaveProperty('field-1');
      expect(storedData['field-1']).toHaveProperty(1e9);
      expect(storedData['field-1'][1e9]).toEqual(fieldData);
    });

    it('stores multiple frequencies for the same field', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(20);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 2e9,
        data: fieldData2,
      }));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData['field-1'][1e9]).toEqual(fieldData1);
      expect(storedData['field-1'][2e9]).toEqual(fieldData2);
      expect(storedData['field-1'][1e9].points.length).toBe(10);
      expect(storedData['field-1'][2e9].points.length).toBe(20);
    });

    it('stores data for multiple fields', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(15);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-2',
        frequencyHz: 1e9,
        data: fieldData2,
      }));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData).toHaveProperty('field-1');
      expect(storedData).toHaveProperty('field-2');
      expect(storedData['field-1'][1e9].points.length).toBe(10);
      expect(storedData['field-2'][1e9].points.length).toBe(15);
    });

    it('overwrites existing data for same field and frequency', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(20);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData2,
      }));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData['field-1'][1e9]).toEqual(fieldData2);
      expect(storedData['field-1'][1e9].points.length).toBe(20);
    });
  });

  describe('clearFieldData', () => {
    it('clears all field data', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(15);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-2',
        frequencyHz: 2e9,
        data: fieldData2,
      }));

      let state = store.getState();
      let storedData = selectFieldData(state);
      expect(Object.keys(storedData)).toHaveLength(2);

      store.dispatch(clearFieldData());

      state = store.getState();
      storedData = selectFieldData(state);
      expect(storedData).toBeNull();
    });

    it('handles clearing when no data exists', () => {
      store.dispatch(clearFieldData());

      const state = store.getState();
      const storedData = selectFieldData(state);
      expect(storedData).toBeNull();
    });
  });

  describe('clearFieldDataForField', () => {
    it('clears data for a specific field', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(15);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-2',
        frequencyHz: 1e9,
        data: fieldData2,
      }));

      store.dispatch(clearFieldDataForField('field-1'));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData).not.toHaveProperty('field-1');
      expect(storedData).toHaveProperty('field-2');
      expect(storedData['field-2'][1e9]).toEqual(fieldData2);
    });

    it('clears all frequencies for a field', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(15);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 2e9,
        data: fieldData2,
      }));

      let state = store.getState();
      let storedData = selectFieldData(state);
      expect(Object.keys(storedData['field-1'])).toHaveLength(2);

      store.dispatch(clearFieldDataForField('field-1'));

      state = store.getState();
      storedData = selectFieldData(state);
      expect(storedData).not.toHaveProperty('field-1');
    });

    it('handles clearing non-existent field', () => {
      const fieldData = makeMockFieldData(10);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData,
      }));

      store.dispatch(clearFieldDataForField('field-nonexistent'));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData).toHaveProperty('field-1');
      expect(storedData['field-1'][1e9]).toEqual(fieldData);
    });
  });

  describe('selectFieldData', () => {
    it('returns empty object when no data exists', () => {
      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(storedData).toBeNull();
    });

    it('returns all field data', () => {
      const fieldData1 = makeMockFieldData(10);
      const fieldData2 = makeMockFieldData(15);

      store.dispatch(setFieldData({
        fieldId: 'field-1',
        frequencyHz: 1e9,
        data: fieldData1,
      }));

      store.dispatch(setFieldData({
        fieldId: 'field-2',
        frequencyHz: 2e9,
        data: fieldData2,
      }));

      const state = store.getState();
      const storedData = selectFieldData(state);

      expect(Object.keys(storedData)).toHaveLength(2);
      expect(storedData['field-1'][1e9]).toEqual(fieldData1);
      expect(storedData['field-2'][2e9]).toEqual(fieldData2);
    });
  });
});
