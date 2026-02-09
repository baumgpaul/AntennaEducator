/**
 * Tests for setFieldDefinitions action in solverSlice
 */
import { describe, it, expect } from 'vitest';
import solverReducer, {
  setFieldDefinitions,
  addFieldRegion,
  deleteFieldRegion,
  clearFieldRegions,
} from '../solverSlice';
import type { FieldDefinition } from '@/types/fieldDefinitions';

// Sample field definitions
const sampleFields: FieldDefinition[] = [
  {
    id: 'field-1',
    type: '2D',
    shape: 'plane',
    centerPoint: [0, 0, 0],
    dimensions: { width: 1, height: 1 },
    normalPreset: 'XY',
    sampling: { x: 20, y: 20 },
    farField: false,
    fieldType: 'E',
    visible: true,
    name: 'E-field plane',
  },
  {
    id: 'field-2',
    type: '3D',
    shape: 'sphere',
    centerPoint: [0, 0, 1],
    sphereRadius: 1.5,
    sampling: { radial: 10, angular: 20 },
    farField: false,
    fieldType: 'poynting',
    visible: true,
  },
];

describe('solverSlice - setFieldDefinitions', () => {
  it('should set field definitions from empty state', () => {
    const initialState = {
      requestedFields: [],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    const newState = solverReducer(initialState, setFieldDefinitions(sampleFields));

    expect(newState.requestedFields).toHaveLength(2);
    expect(newState.requestedFields[0].id).toBe('field-1');
    expect(newState.requestedFields[1].shape).toBe('sphere');
  });

  it('should replace existing field definitions', () => {
    const initialState = {
      requestedFields: [
        {
          id: 'old-field',
          type: '2D' as const,
          shape: 'circle' as const,
          centerPoint: [1, 1, 1] as [number, number, number],
          dimensions: { radius: 2 },
          normalPreset: 'XY' as const,
          sampling: { x: 10, y: 10 },
          farField: false,
          fieldType: 'H' as const,
        },
      ],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    const newState = solverReducer(initialState, setFieldDefinitions(sampleFields));

    expect(newState.requestedFields).toHaveLength(2);
    expect(newState.requestedFields[0].id).toBe('field-1');
    expect(newState.requestedFields).not.toContainEqual(
      expect.objectContaining({ id: 'old-field' })
    );
  });

  it('should set to empty array when given empty array', () => {
    const initialState = {
      requestedFields: sampleFields,
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    const newState = solverReducer(initialState, setFieldDefinitions([]));

    expect(newState.requestedFields).toEqual([]);
  });

  it('should preserve field properties (name, visible)', () => {
    const fieldsWithProperties: FieldDefinition[] = [
      {
        ...sampleFields[0],
        name: 'Custom Field Name',
        visible: false,
      },
      {
        ...sampleFields[1],
        name: 'Another Field',
        visible: true,
      },
    ];

    const initialState = {
      requestedFields: [],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    const newState = solverReducer(initialState, setFieldDefinitions(fieldsWithProperties));

    expect(newState.requestedFields[0].name).toBe('Custom Field Name');
    expect(newState.requestedFields[0].visible).toBe(false);
    expect(newState.requestedFields[1].name).toBe('Another Field');
    expect(newState.requestedFields[1].visible).toBe(true);
  });

  it('should work with addFieldRegion after setFieldDefinitions', () => {
    const initialState = {
      requestedFields: [],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    // Set initial fields
    let state = solverReducer(initialState, setFieldDefinitions([sampleFields[0]]));
    expect(state.requestedFields).toHaveLength(1);

    // Add another field
    state = solverReducer(state, addFieldRegion(sampleFields[1]));
    expect(state.requestedFields).toHaveLength(2);
    expect(state.requestedFields[1].id).toBe('field-2');
  });

  it('should work with deleteFieldRegion after setFieldDefinitions', () => {
    const initialState = {
      requestedFields: [],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    // Set fields
    let state = solverReducer(initialState, setFieldDefinitions(sampleFields));
    expect(state.requestedFields).toHaveLength(2);

    // Delete one
    state = solverReducer(state, deleteFieldRegion('field-1'));
    expect(state.requestedFields).toHaveLength(1);
    expect(state.requestedFields[0].id).toBe('field-2');
  });

  it('should work with clearFieldRegions after setFieldDefinitions', () => {
    const initialState = {
      requestedFields: [],
      status: 'idle' as const,
      progress: 0,
      error: null,
      results: null,
      currentDistribution: null,
      resultsHistory: [],
      frequencySweep: {
        startFreq: 100,
        endFreq: 1000,
        numPoints: 10,
        spacing: 'linear' as const,
      },
      sweepInProgress: false,
      radiationPattern: null,
      directivityRequested: false,
      solverState: 'idle' as const,
      currentFrequency: null,
    };

    // Set fields
    let state = solverReducer(initialState, setFieldDefinitions(sampleFields));
    expect(state.requestedFields).toHaveLength(2);

    // Clear all
    state = solverReducer(state, clearFieldRegions());
    expect(state.requestedFields).toEqual([]);
  });
});
