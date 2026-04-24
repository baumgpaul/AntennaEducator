/**
 * Tests for PostprocessingTab warning banner condition.
 *
 * The banner shows when:
 *   (!frequencySweep && !currentFrequency) || resultsStale
 *
 * Notably it does NOT use isSolved — that was removed because designSlice.isSolved
 * resets to false on project reload, causing a false "outdated" banner.
 */
import { describe, it, expect } from 'vitest';

/**
 * Pure-logic replica of the banner visibility condition from PostprocessingTab.
 * Kept in sync with the actual code — if the condition changes, update here.
 */
function shouldShowBanner(
  frequencySweep: unknown,
  currentFrequency: number | null,
  resultsStale: boolean,
): boolean {
  return (!frequencySweep && !currentFrequency) || resultsStale;
}

describe('PostprocessingTab banner condition', () => {
  it('shows banner when no results at all', () => {
    expect(shouldShowBanner(null, null, false)).toBe(true);
  });

  it('hides banner when frequencySweep exists and not stale', () => {
    expect(shouldShowBanner({ frequencies: [300e6] }, null, false)).toBe(false);
  });

  it('hides banner when currentFrequency exists and not stale', () => {
    expect(shouldShowBanner(null, 300, false)).toBe(false);
  });

  it('shows banner when resultsStale even with results', () => {
    expect(shouldShowBanner({ frequencies: [300e6] }, 300, true)).toBe(true);
  });

  it('hides banner for loaded project with sweep data', () => {
    // Simulates a project reload where frequencySweep was restored
    const sweep = { frequencies: [300e6, 350e6], results: [{}, {}] };
    expect(shouldShowBanner(sweep, null, false)).toBe(false);
  });

  it('hides banner for loaded project with single-frequency result', () => {
    // Simulates a project reload where currentFrequency was restored
    expect(shouldShowBanner(null, 300, false)).toBe(false);
  });

  it('does NOT depend on isSolved (removed condition)', () => {
    // Previously the condition included (!isSweepMode && !isSolved) which caused
    // false banners after project reload. This test documents that the condition
    // no longer depends on isSolved.
    const isSolved = false;
    const isSweepMode = false;
    // Old condition would be: shouldShowBanner(...) || (!isSweepMode && !isSolved) → true
    // New condition only checks data presence + stale flag
    expect(shouldShowBanner({ frequencies: [300e6] }, 300, false)).toBe(false);
    // Confirm isSolved=false does NOT make it show
    void isSolved;
    void isSweepMode;
  });
});

describe('solverWasReady — project load detection', () => {
  /**
   * Pure-logic replica of DesignPage's solverWasReady derivation.
   */
  function computeSolverWasReady(simulationResults: Record<string, any> | null | undefined): boolean {
    const hasSolverResults = simulationResults && Object.keys(simulationResults).length > 0;
    return !!(
      hasSolverResults &&
      (
        simulationResults!.solverState === 'solved' ||
        simulationResults!.solverState === 'postprocessing-ready' ||
        !!simulationResults!.results ||
        !!simulationResults!.frequencySweep
      )
    );
  }

  it('returns true for solverState=solved', () => {
    expect(computeSolverWasReady({ solverState: 'solved' })).toBe(true);
  });

  it('returns true for solverState=postprocessing-ready', () => {
    expect(computeSolverWasReady({ solverState: 'postprocessing-ready' })).toBe(true);
  });

  it('returns true when results exist but solverState is idle', () => {
    // Legacy project that didn't persist solverState
    expect(computeSolverWasReady({ solverState: 'idle', results: { some: 'data' } })).toBe(true);
  });

  it('returns true when frequencySweep exists but solverState is idle', () => {
    expect(computeSolverWasReady({ solverState: 'idle', frequencySweep: { frequencies: [300e6] } })).toBe(true);
  });

  it('returns false for empty simulation_results', () => {
    expect(computeSolverWasReady({})).toBe(false);
  });

  it('returns false for null simulation_results', () => {
    expect(computeSolverWasReady(null)).toBe(false);
  });

  it('returns false when only solverState=idle with no data', () => {
    expect(computeSolverWasReady({ solverState: 'idle' })).toBe(false);
  });
});
