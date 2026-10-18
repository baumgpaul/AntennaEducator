import type { Dispatch } from '@reduxjs/toolkit';
import type { MultiAntennaSolutionResponse } from '@/types/api';
import { showWarning } from './uiSlice';

/**
 * Show the solver's model-validity warnings (e.g. a wire fed against ground)
 * as notifications. Pass the same `shown` set across a sweep or parameter
 * study so each warning appears once, not once per frequency.
 */
export function notifySolverWarnings(
  dispatch: Dispatch,
  response: Pick<MultiAntennaSolutionResponse, 'warnings'>,
  shown: Set<string> = new Set(),
): void {
  for (const warning of response.warnings ?? []) {
    if (shown.has(warning)) continue;
    shown.add(warning);
    dispatch(showWarning(warning, 15000));
  }
}
