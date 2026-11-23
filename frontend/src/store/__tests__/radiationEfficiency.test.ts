import { describe, expect, it } from 'vitest';
import solverReducer, {
  setRadiationPatternForFrequency,
  withSolveEfficiency,
  type RadiationPatternData,
} from '../solverSlice';

const pattern = (frequency: number): RadiationPatternData => ({
  frequency,
  theta_angles: [0],
  phi_angles: [0],
  E_theta_mag: [1],
  E_phi_mag: [0],
  E_total_mag: [1],
  pattern_db: [0],
  directivity: 2.15,
  gain: 2.15, // the far-field service's placeholder (gain = directivity)
  efficiency: 1,
  max_direction: [90, 0],
});

const base = solverReducer(undefined, { type: 'init' });

describe('gain and efficiency from the solve', () => {
  it('gain = directivity + 10 log10(efficiency)', () => {
    const p = withSolveEfficiency(pattern(3e8), 0.5);
    expect(p.efficiency).toBe(0.5);
    expect(p.gain).toBeCloseTo(2.15 - 3.0103, 4);
  });

  it('single solve: efficiency of state.results', () => {
    const state = { ...base, results: { radiation_efficiency: 0.8 } as never };
    const next = solverReducer(state, setRadiationPatternForFrequency({ frequencyHz: 3e8, pattern: pattern(3e8) }));
    expect(next.radiationPattern?.efficiency).toBe(0.8);
    expect(next.radiationPattern?.gain).toBeCloseTo(2.15 + 10 * Math.log10(0.8), 6);
  });

  it('frequency sweep: the result at that frequency', () => {
    const state = {
      ...base,
      results: { radiation_efficiency: 0.99 } as never,
      frequencySweep: {
        frequencies: [2e8, 3e8],
        results: [
          { frequency: 2e8, radiation_efficiency: 0.6 },
          { frequency: 3e8, radiation_efficiency: 0.9 },
        ],
      } as never,
    };
    const next = solverReducer(state, setRadiationPatternForFrequency({ frequencyHz: 2e8, pattern: pattern(2e8) }));
    expect(next.radiationPatterns?.[2e8].efficiency).toBe(0.6);
  });

  it('parameter sweep: the result of that sweep point', () => {
    const state = {
      ...base,
      solveMode: 'sweep' as const,
      parameterStudy: {
        results: [
          { solverResponse: { radiation_efficiency: 0.7 } },
          { solverResponse: { radiation_efficiency: 0.4 } },
        ],
      } as never,
    };
    const next = solverReducer(state, setRadiationPatternForFrequency({ frequencyHz: 1, pattern: pattern(3e8) }));
    expect(next.radiationPatterns?.[1].efficiency).toBe(0.4);
  });

  it('older solve results without the field keep the placeholder', () => {
    const state = { ...base, results: { frequency: 3e8 } as never };
    const next = solverReducer(state, setRadiationPatternForFrequency({ frequencyHz: 3e8, pattern: pattern(3e8) }));
    expect(next.radiationPattern?.efficiency).toBe(1);
    expect(next.radiationPattern?.gain).toBe(2.15);
  });
});
