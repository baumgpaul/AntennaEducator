/**
 * Tests for Submissions Redux slice.
 *
 * Run with: npx vitest run src/store/submissionsSlice.test.ts
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import submissionsReducer, {
  clearSubmissionsError,
  clearCurrentSubmission,
  setCurrentCourseId,
  selectMySubmissions,
  selectCourseSubmissions,
  selectCurrentSubmission,
  selectSubmissionsLoading,
} from './submissionsSlice';
import type { Submission, SubmissionDetail } from '@/api/submissions';

function createStore(overrides: Record<string, unknown> = {}) {
  return configureStore({
    reducer: { submissions: submissionsReducer },
    preloadedState: {
      submissions: {
        mySubmissions: [],
        courseSubmissions: [],
        currentSubmission: null,
        currentCourseId: null,
        loading: false,
        detailLoading: false,
        submitLoading: false,
        reviewLoading: false,
        error: null,
        ...overrides,
      } as ReturnType<typeof submissionsReducer>,
    },
  });
}

const mockSubmission: Submission = {
  submission_id: 'sub-1',
  course_id: 'c-1',
  project_id: 'p-1',
  user_id: 'u-1',
  project_name: 'Test Dipole',
  status: 'submitted',
  feedback: '',
  submitted_at: '2025-01-01T00:00:00Z',
  reviewed_at: '',
  reviewed_by: '',
};

describe('submissionsSlice', () => {
  describe('initial state', () => {
    it('should have correct initial state', () => {
      const store = createStore();
      const state = store.getState().submissions;
      expect(state.mySubmissions).toEqual([]);
      expect(state.courseSubmissions).toEqual([]);
      expect(state.currentSubmission).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('synchronous actions', () => {
    it('clearSubmissionsError should clear the error', () => {
      const store = createStore({ error: 'Something went wrong' });
      store.dispatch(clearSubmissionsError());
      expect(store.getState().submissions.error).toBeNull();
    });

    it('clearCurrentSubmission should clear current submission', () => {
      const detail: SubmissionDetail = {
        ...mockSubmission,
        frozen_design_state: {},
        frozen_simulation_config: {},
        frozen_simulation_results: {},
        frozen_ui_state: {},
      };
      const store = createStore({ currentSubmission: detail });
      store.dispatch(clearCurrentSubmission());
      expect(store.getState().submissions.currentSubmission).toBeNull();
    });

    it('setCurrentCourseId should update course ID', () => {
      const store = createStore();
      store.dispatch(setCurrentCourseId('c-42'));
      expect(store.getState().submissions.currentCourseId).toBe('c-42');
    });
  });

  describe('selectors', () => {
    it('selectMySubmissions returns mySubmissions', () => {
      const store = createStore({ mySubmissions: [mockSubmission] });
      const state = store.getState() as { submissions: ReturnType<typeof submissionsReducer> };
      expect(selectMySubmissions(state)).toEqual([mockSubmission]);
    });

    it('selectCourseSubmissions returns courseSubmissions', () => {
      const store = createStore({ courseSubmissions: [mockSubmission] });
      const state = store.getState() as { submissions: ReturnType<typeof submissionsReducer> };
      expect(selectCourseSubmissions(state)).toEqual([mockSubmission]);
    });

    it('selectCurrentSubmission returns null initially', () => {
      const store = createStore();
      const state = store.getState() as { submissions: ReturnType<typeof submissionsReducer> };
      expect(selectCurrentSubmission(state)).toBeNull();
    });

    it('selectSubmissionsLoading returns loading state', () => {
      const store = createStore({ loading: true });
      const state = store.getState() as { submissions: ReturnType<typeof submissionsReducer> };
      expect(selectSubmissionsLoading(state)).toBe(true);
    });
  });
});
