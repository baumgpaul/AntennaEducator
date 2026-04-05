/**
 * Submissions API service
 * Handles course project submissions, student listing, and instructor review.
 */

import { projectsClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Submission {
  submission_id: string;
  course_id: string;
  project_id: string;
  user_id: string;
  project_name: string;
  status: 'submitted' | 'reviewed' | 'returned';
  feedback: string;
  submitted_at: string;
  reviewed_at: string;
  reviewed_by: string;
}

export interface SubmissionDetail extends Submission {
  frozen_design_state: Record<string, unknown> | null;
  frozen_simulation_config: Record<string, unknown> | null;
  frozen_simulation_results: Record<string, unknown> | null;
  frozen_ui_state: Record<string, unknown> | null;
}

export interface SubmitProjectRequest {
  project_id: string;
}

export interface ReviewSubmissionRequest {
  feedback: string;
  status: 'reviewed' | 'returned';
}

// ============================================================================
// Student endpoints
// ============================================================================

export async function submitProject(
  courseId: string,
  data: SubmitProjectRequest,
): Promise<Submission> {
  const resp = await projectsClient.post<Submission>(
    `/api/courses/${courseId}/submissions`,
    data,
  );
  return resp.data;
}

export async function getMySubmissions(): Promise<Submission[]> {
  const resp = await projectsClient.get<Submission[]>('/api/my-submissions');
  return resp.data;
}

// ============================================================================
// Shared endpoints (scoped by role on backend)
// ============================================================================

export async function getCourseSubmissions(
  courseId: string,
): Promise<Submission[]> {
  const resp = await projectsClient.get<Submission[]>(
    `/api/courses/${courseId}/submissions`,
  );
  return resp.data;
}

export async function getSubmissionDetail(
  courseId: string,
  submissionId: string,
): Promise<SubmissionDetail> {
  const resp = await projectsClient.get<SubmissionDetail>(
    `/api/courses/${courseId}/submissions/${submissionId}`,
  );
  return resp.data;
}

// ============================================================================
// Instructor endpoints
// ============================================================================

export async function reviewSubmission(
  courseId: string,
  submissionId: string,
  data: ReviewSubmissionRequest,
): Promise<Submission> {
  const resp = await projectsClient.patch<Submission>(
    `/api/courses/${courseId}/submissions/${submissionId}/review`,
    data,
  );
  return resp.data;
}
