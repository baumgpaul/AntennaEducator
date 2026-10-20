/**
 * A workflow as steps (tabs), shared by the antenna designer and the field solver:
 * each step has a status, unlocks when the steps it needs are done, and
 * explains what it means for the method ("Learn").
 */

/** done: complete · attention: something to fix · todo: not started · locked: needs earlier steps */
export type StepStatus = 'done' | 'attention' | 'todo' | 'locked';

export interface WorkflowStep<Id extends string = string> {
  id: Id;
  label: string;
  /** What this step is, in one line */
  summary: string;
  /** What it means for the method (the Learn tab) */
  learn: string[];
  /** Steps that must be done before this one can start */
  requires: Id[];
}

/** Status of every step; a step is locked until all of its prerequisites are done. */
export function stepStatuses<Id extends string>(
  steps: WorkflowStep<Id>[],
  done: ReadonlySet<Id>,
  attention: ReadonlySet<Id> = new Set(),
): Record<Id, StepStatus> {
  const result = {} as Record<Id, StepStatus>;
  for (const step of steps) {
    if (!step.requires.every((r) => done.has(r))) result[step.id] = 'locked';
    else if (attention.has(step.id)) result[step.id] = 'attention';
    else result[step.id] = done.has(step.id) ? 'done' : 'todo';
  }
  return result;
}

/** The first step that still needs work (where "Next" leads), or null when all are done. */
export function nextStep<Id extends string>(steps: WorkflowStep<Id>[], statuses: Record<Id, StepStatus>): Id | null {
  return steps.find((s) => statuses[s.id] !== 'done')?.id ?? null;
}

export const STATUS_TEXT: Record<StepStatus, string> = {
  done: 'done',
  attention: 'needs attention',
  todo: 'to do',
  locked: 'locked: finish the previous steps first',
};
