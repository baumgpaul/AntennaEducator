/**
 * Tests for Submissions API client.
 *
 * Run with: npx vitest run src/api/submissions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  submitProject,
  getMySubmissions,
  getCourseSubmissions,
  getSubmissionDetail,
  reviewSubmission,
} from './submissions';

const hoisted = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('axios', () => ({}));

vi.mock('./client', () => ({
  getProjectsURL: () => 'http://localhost:8010',
  projectsClient: hoisted.mockClient,
  default: hoisted.mockClient,
}));

const mockSubmission = {
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

describe('Submissions API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitProject', () => {
    it('should POST to /api/courses/{courseId}/submissions', async () => {
      hoisted.mockClient.post.mockResolvedValueOnce({ data: mockSubmission });
      const result = await submitProject('c-1', { project_id: 'p-1' });
      expect(hoisted.mockClient.post).toHaveBeenCalledWith(
        '/api/courses/c-1/submissions',
        { project_id: 'p-1' },
      );
      expect(result.submission_id).toBe('sub-1');
    });
  });

  describe('getMySubmissions', () => {
    it('should GET /api/my-submissions', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [mockSubmission] });
      const result = await getMySubmissions();
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/my-submissions');
      expect(result).toHaveLength(1);
    });
  });

  describe('getCourseSubmissions', () => {
    it('should GET /api/courses/{courseId}/submissions', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [mockSubmission] });
      const result = await getCourseSubmissions('c-1');
      expect(hoisted.mockClient.get).toHaveBeenCalledWith(
        '/api/courses/c-1/submissions',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getSubmissionDetail', () => {
    it('should GET /api/courses/{courseId}/submissions/{submissionId}', async () => {
      const detail = { ...mockSubmission, frozen_design_state: { elements: [] } };
      hoisted.mockClient.get.mockResolvedValueOnce({ data: detail });
      const result = await getSubmissionDetail('c-1', 'sub-1');
      expect(hoisted.mockClient.get).toHaveBeenCalledWith(
        '/api/courses/c-1/submissions/sub-1',
      );
      expect(result.frozen_design_state).toBeDefined();
    });
  });

  describe('reviewSubmission', () => {
    it('should PATCH /api/courses/{courseId}/submissions/{submissionId}/review', async () => {
      const reviewed = { ...mockSubmission, status: 'reviewed', feedback: 'Good!' };
      hoisted.mockClient.patch.mockResolvedValueOnce({ data: reviewed });
      const result = await reviewSubmission('c-1', 'sub-1', {
        feedback: 'Good!',
        status: 'reviewed',
      });
      expect(hoisted.mockClient.patch).toHaveBeenCalledWith(
        '/api/courses/c-1/submissions/sub-1/review',
        { feedback: 'Good!', status: 'reviewed' },
      );
      expect(result.status).toBe('reviewed');
    });
  });
});
