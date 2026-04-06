/**
 * Submissions state slice
 * Manages course submissions for students and instructors.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import * as submissionsApi from '@/api/submissions';
import type { Submission, SubmissionDetail } from '@/api/submissions';

export type { Submission, SubmissionDetail } from '@/api/submissions';

// ============================================================================
// State
// ============================================================================

interface SubmissionsState {
  /** My submissions (student view — across all courses) */
  mySubmissions: Submission[];
  /** Submissions for a specific course (instructor view) */
  courseSubmissions: Submission[];
  /** Currently viewed submission detail (with frozen snapshot) */
  currentSubmission: SubmissionDetail | null;
  /** Course ID currently being viewed */
  currentCourseId: string | null;

  loading: boolean;
  detailLoading: boolean;
  submitLoading: boolean;
  reviewLoading: boolean;
  error: string | null;
}

const initialState: SubmissionsState = {
  mySubmissions: [],
  courseSubmissions: [],
  currentSubmission: null,
  currentCourseId: null,
  loading: false,
  detailLoading: false,
  submitLoading: false,
  reviewLoading: false,
  error: null,
};

// ============================================================================
// Thunks
// ============================================================================

export const submitProject = createAsyncThunk(
  'submissions/submitProject',
  async ({ courseId, projectId }: { courseId: string; projectId: string }) => {
    return submissionsApi.submitProject(courseId, { project_id: projectId });
  },
);

export const fetchMySubmissions = createAsyncThunk(
  'submissions/fetchMySubmissions',
  async () => {
    return submissionsApi.getMySubmissions();
  },
);

export const fetchCourseSubmissions = createAsyncThunk(
  'submissions/fetchCourseSubmissions',
  async (courseId: string) => {
    return submissionsApi.getCourseSubmissions(courseId);
  },
);

export const fetchSubmissionDetail = createAsyncThunk(
  'submissions/fetchSubmissionDetail',
  async ({ courseId, submissionId }: { courseId: string; submissionId: string }) => {
    return submissionsApi.getSubmissionDetail(courseId, submissionId);
  },
);

export const reviewSubmission = createAsyncThunk(
  'submissions/reviewSubmission',
  async ({
    courseId,
    submissionId,
    feedback,
    status,
  }: {
    courseId: string;
    submissionId: string;
    feedback: string;
    status: 'reviewed' | 'returned';
  }) => {
    return submissionsApi.reviewSubmission(courseId, submissionId, { feedback, status });
  },
);

// ============================================================================
// Slice
// ============================================================================

const submissionsSlice = createSlice({
  name: 'submissions',
  initialState,
  reducers: {
    clearSubmissionsError(state) {
      state.error = null;
    },
    clearCurrentSubmission(state) {
      state.currentSubmission = null;
    },
    setCurrentCourseId(state, action: PayloadAction<string | null>) {
      state.currentCourseId = action.payload;
    },
  },
  extraReducers: (builder) => {
    // submitProject
    builder
      .addCase(submitProject.pending, (state) => {
        state.submitLoading = true;
        state.error = null;
      })
      .addCase(submitProject.fulfilled, (state, action) => {
        state.submitLoading = false;
        state.mySubmissions.unshift(action.payload);
      })
      .addCase(submitProject.rejected, (state, action) => {
        state.submitLoading = false;
        state.error = action.error.message ?? 'Failed to submit project';
      });

    // fetchMySubmissions
    builder
      .addCase(fetchMySubmissions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMySubmissions.fulfilled, (state, action) => {
        state.loading = false;
        state.mySubmissions = action.payload;
      })
      .addCase(fetchMySubmissions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch submissions';
      });

    // fetchCourseSubmissions
    builder
      .addCase(fetchCourseSubmissions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCourseSubmissions.fulfilled, (state, action) => {
        state.loading = false;
        state.courseSubmissions = action.payload;
        state.currentCourseId = action.meta.arg;
      })
      .addCase(fetchCourseSubmissions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch course submissions';
      });

    // fetchSubmissionDetail
    builder
      .addCase(fetchSubmissionDetail.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchSubmissionDetail.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.currentSubmission = action.payload;
      })
      .addCase(fetchSubmissionDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.error.message ?? 'Failed to fetch submission detail';
      });

    // reviewSubmission
    builder
      .addCase(reviewSubmission.pending, (state) => {
        state.reviewLoading = true;
        state.error = null;
      })
      .addCase(reviewSubmission.fulfilled, (state, action) => {
        state.reviewLoading = false;
        // Update in courseSubmissions list
        const idx = state.courseSubmissions.findIndex(
          (s) => s.submission_id === action.payload.submission_id,
        );
        if (idx !== -1) {
          state.courseSubmissions[idx] = action.payload;
        }
        // Update current detail if viewing
        if (
          state.currentSubmission &&
          state.currentSubmission.submission_id === action.payload.submission_id
        ) {
          state.currentSubmission = {
            ...state.currentSubmission,
            ...action.payload,
          };
        }
      })
      .addCase(reviewSubmission.rejected, (state, action) => {
        state.reviewLoading = false;
        state.error = action.error.message ?? 'Failed to review submission';
      });
  },
});

export const { clearSubmissionsError, clearCurrentSubmission, setCurrentCourseId } =
  submissionsSlice.actions;

// ============================================================================
// Selectors
// ============================================================================

export const selectMySubmissions = (state: RootState) => state.submissions.mySubmissions;
export const selectCourseSubmissions = (state: RootState) => state.submissions.courseSubmissions;
export const selectCurrentSubmission = (state: RootState) => state.submissions.currentSubmission;
export const selectSubmissionsLoading = (state: RootState) => state.submissions.loading;
export const selectSubmitLoading = (state: RootState) => state.submissions.submitLoading;
export const selectReviewLoading = (state: RootState) => state.submissions.reviewLoading;
export const selectDetailLoading = (state: RootState) => state.submissions.detailLoading;
export const selectSubmissionsError = (state: RootState) => state.submissions.error;

export default submissionsSlice.reducer;
