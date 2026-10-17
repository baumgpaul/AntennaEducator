import { describe, it, expect } from 'vitest';
import solverReducer, { RESULTS_STALE_ACTIONS } from '../solverSlice';
import designReducer, * as designModule from '../designSlice';

/** Every action type the design slice can produce (reducers + thunks). */
function designActionTypes(): Set<string> {
  const types = new Set<string>();
  for (const value of Object.values(designModule)) {
    if (typeof value === 'function' && 'type' in value && typeof value.type === 'string') {
      types.add(value.type);
    }
    // createAsyncThunk exposes .fulfilled/.pending/.rejected action creators
    const thunk = value as { fulfilled?: { type: string } };
    if (thunk && typeof thunk === 'function' && thunk.fulfilled?.type) {
      types.add(thunk.fulfilled.type);
    }
  }
  return types;
}

describe('results-stale action list (B32)', () => {
  it('only names actions that the design slice really has', () => {
    const known = designActionTypes();
    const unknown = [...RESULTS_STALE_ACTIONS].filter((t) => !known.has(t));
    expect(unknown).toEqual([]);
  });

  it('includes moving and removing elements and sources', () => {
    for (const t of [
      'design/setElementPosition',
      'design/setElementRotation',
      'design/removeSource',
      'design/removeLumpedElement',
    ]) {
      expect(RESULTS_STALE_ACTIONS.has(t)).toBe(true);
    }
  });

  it('marks existing results stale on a geometry change, not on cosmetic ones', () => {
    const withResults = {
      ...solverReducer(undefined, { type: 'init' }),
      results: { frequency: 1 } as never,
    };
    expect(
      solverReducer(withResults, { type: 'design/setElementColor', payload: {} }).resultsStale,
    ).toBe(false);
    expect(
      solverReducer(withResults, { type: 'design/setElementPosition', payload: {} }).resultsStale,
    ).toBe(true);
  });

  it('design reducer is importable alongside (no import cycle)', () => {
    expect(typeof designReducer).toBe('function');
  });
});
