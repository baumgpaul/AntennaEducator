import { describe, it, expect } from 'vitest';
import designReducer, { loadDesign, selectGroundPlane, setGroundPlane } from '../designSlice';
import { groundPlaneOf, withGroundPlane } from '../solverSlice';
import type { RootState } from '../store';

const stateWith = (groundPlane: boolean) =>
  ({ design: { ...designReducer(undefined, { type: 'init' }), groundPlane } }) as unknown as RootState;

describe('ground plane setting', () => {
  it('is off by default and for projects saved before it existed', () => {
    const fresh = designReducer(undefined, { type: 'init' });
    expect(selectGroundPlane({ design: fresh })).toBe(false);
    const loaded = designReducer(fresh, loadDesign({ elements: [] }));
    expect(loaded.groundPlane).toBe(false);
  });

  it('switching it marks the design as unsolved (results no longer match)', () => {
    const solved = { ...designReducer(undefined, { type: 'init' }), isSolved: true };
    const after = designReducer(solved, setGroundPlane(true));
    expect(after.groundPlane).toBe(true);
    expect(after.isSolved).toBe(false);
    // setting the same value again keeps a fresh solve valid
    expect(designReducer({ ...after, isSolved: true }, setGroundPlane(true)).isSolved).toBe(true);
  });

  it('is added to solver requests, keeping other config', () => {
    const request = { frequency: 3e8, antennas: [], config: { resistivity: 1e-8 } };
    expect(withGroundPlane(request, stateWith(true)).config).toEqual({ resistivity: 1e-8, ground_plane: true });
    expect(withGroundPlane({ frequency: 3e8, antennas: [] }, stateWith(false)).config).toEqual({
      ground_plane: false,
    });
    expect(groundPlaneOf(stateWith(true))).toBe(true);
  });
});
