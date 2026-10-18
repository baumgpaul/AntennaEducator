import { describe, it, expect, vi } from 'vitest';
import { notifySolverWarnings } from '../solverWarnings';

describe('notifySolverWarnings', () => {
  it('shows each warning once across a sweep', () => {
    const dispatch = vi.fn();
    const shown = new Set<string>();
    notifySolverWarnings(dispatch, { warnings: ['rod1: fed against ground'] }, shown);
    notifySolverWarnings(dispatch, { warnings: ['rod1: fed against ground'] }, shown);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({
      severity: 'warning',
      message: 'rod1: fed against ground',
    });
  });

  it('does nothing without warnings (older responses)', () => {
    const dispatch = vi.fn();
    notifySolverWarnings(dispatch, {});
    expect(dispatch).not.toHaveBeenCalled();
  });
});
