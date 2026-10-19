import { describe, it, expect } from 'vitest';
import { FEM_STEPS, nextStep, stepStatuses, type FemStepId } from '../workflow';

const done = (...ids: FemStepId[]) => new Set<FemStepId>(ids);

describe('FEM workflow steps', () => {
  it('runs geometry → materials → physics → mesh → solve → results', () => {
    expect(FEM_STEPS.map((s) => s.id)).toEqual(['geometry', 'materials', 'physics', 'mesh', 'solve', 'results']);
    // every prerequisite is an earlier step
    FEM_STEPS.forEach((s, i) =>
      s.requires.forEach((r) => expect(FEM_STEPS.findIndex((x) => x.id === r)).toBeLessThan(i)),
    );
  });

  it('has a Learn text for every step', () => {
    FEM_STEPS.forEach((s) => expect(s.learn.length).toBeGreaterThan(0));
  });

  it('locks steps until their prerequisites are done', () => {
    const s = stepStatuses(done());
    expect(s.geometry).toBe('todo');
    expect(s.materials).toBe('locked');
    expect(s.results).toBe('locked');

    const t = stepStatuses(done('geometry', 'materials'));
    expect([t.geometry, t.materials, t.physics, t.mesh]).toEqual(['done', 'done', 'todo', 'locked']);
  });

  it('flags steps that need attention, but not locked ones', () => {
    const s = stepStatuses(done('geometry'), done('materials', 'mesh'));
    expect(s.materials).toBe('attention');
    expect(s.mesh).toBe('locked');
  });

  it('"Next" leads to the first step that is not done', () => {
    expect(nextStep(stepStatuses(done()))).toBe('geometry');
    expect(nextStep(stepStatuses(done('geometry', 'materials')))).toBe('physics');
    expect(nextStep(stepStatuses(done('geometry', 'materials'), done('geometry')))).toBe('geometry');
    const all = done(...FEM_STEPS.map((s) => s.id));
    expect(nextStep(stepStatuses(all))).toBeNull();
  });
});
