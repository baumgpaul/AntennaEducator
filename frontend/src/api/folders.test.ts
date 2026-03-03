/**
 * Tests for Folders API client.
 *
 * Run with: npx vitest run src/api/folders.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  getFolderContents,
  getCourses,
  getCourseProjects,
  createCourse,
  copyCourseToUser,
  copyCourseProjectToUser,
  listUsers,
  updateUserRole,
} from './folders';

// Hoist-safe mocks
const hoisted = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('axios', () => ({}));

vi.mock('./client', () => ({
  getProjectsURL: () => 'http://localhost:8010',
  projectsClient: hoisted.mockClient,
  default: hoisted.mockClient,
}));

const mockFolder = {
  id: 'f-1',
  owner_id: 'u-1',
  name: 'Test Folder',
  parent_folder_id: null,
  is_course: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('Folders API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── User Folders ─────────────────────────────────────────────────────────

  describe('getFolders', () => {
    it('should call GET /api/folders without params', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [mockFolder] });
      const result = await getFolders();
      expect(result).toEqual([mockFolder]);
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/folders', { params: {} });
    });

    it('should pass parent_folder_id param', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [] });
      await getFolders('f-parent');
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/folders', {
        params: { parent_folder_id: 'f-parent' },
      });
    });
  });

  describe('getFolder', () => {
    it('should call GET /api/folders/:id', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: mockFolder });
      const result = await getFolder('f-1');
      expect(result).toEqual(mockFolder);
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/folders/f-1');
    });
  });

  describe('createFolder', () => {
    it('should call POST /api/folders', async () => {
      hoisted.mockClient.post.mockResolvedValueOnce({ data: mockFolder });
      const result = await createFolder({ name: 'New Folder' });
      expect(result).toEqual(mockFolder);
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/folders', { name: 'New Folder' });
    });

    it('should include parent_folder_id when provided', async () => {
      hoisted.mockClient.post.mockResolvedValueOnce({ data: mockFolder });
      await createFolder({ name: 'Sub', parent_folder_id: 'f-parent' });
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/folders', {
        name: 'Sub',
        parent_folder_id: 'f-parent',
      });
    });
  });

  describe('updateFolder', () => {
    it('should call PUT /api/folders/:id', async () => {
      hoisted.mockClient.put.mockResolvedValueOnce({ data: { ...mockFolder, name: 'Renamed' } });
      const result = await updateFolder('f-1', { name: 'Renamed' });
      expect(result.name).toBe('Renamed');
      expect(hoisted.mockClient.put).toHaveBeenCalledWith('/api/folders/f-1', { name: 'Renamed' });
    });
  });

  describe('deleteFolder', () => {
    it('should call DELETE /api/folders/:id', async () => {
      hoisted.mockClient.delete.mockResolvedValueOnce({});
      await deleteFolder('f-1');
      expect(hoisted.mockClient.delete).toHaveBeenCalledWith('/api/folders/f-1');
    });
  });

  describe('getFolderContents', () => {
    it('should call GET /api/folders/:id/contents', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [] });
      const result = await getFolderContents('f-1');
      expect(result).toEqual([]);
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/folders/f-1/contents');
    });
  });

  // ── Courses ──────────────────────────────────────────────────────────────

  describe('getCourses', () => {
    it('should call GET /api/courses', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [] });
      const result = await getCourses();
      expect(result).toEqual([]);
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/courses', { params: {} });
    });
  });

  describe('getCourseProjects', () => {
    it('should call GET /api/courses/:id/projects', async () => {
      hoisted.mockClient.get.mockResolvedValueOnce({ data: [] });
      await getCourseProjects('c-1');
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/courses/c-1/projects');
    });
  });

  describe('createCourse', () => {
    it('should call POST /api/courses', async () => {
      const course = { ...mockFolder, is_course: true };
      hoisted.mockClient.post.mockResolvedValueOnce({ data: course });
      const result = await createCourse({ name: 'EM Basics' });
      expect(result.is_course).toBe(true);
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/courses', { name: 'EM Basics' });
    });
  });

  // ── Deep Copy ────────────────────────────────────────────────────────────

  describe('copyCourseToUser', () => {
    it('should call POST /api/courses/:id/copy', async () => {
      hoisted.mockClient.post.mockResolvedValueOnce({ data: mockFolder });
      const result = await copyCourseToUser('c-1', { target_folder_id: 'f-dest' });
      expect(result).toEqual(mockFolder);
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/courses/c-1/copy', {
        target_folder_id: 'f-dest',
      });
    });

    it('should work without target_folder_id', async () => {
      hoisted.mockClient.post.mockResolvedValueOnce({ data: mockFolder });
      await copyCourseToUser('c-1');
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/courses/c-1/copy', {});
    });
  });

  describe('copyCourseProjectToUser', () => {
    it('should call POST /api/courses/projects/:id/copy', async () => {
      const project = { id: 'p-1', name: 'Test' };
      hoisted.mockClient.post.mockResolvedValueOnce({ data: project });
      const result = await copyCourseProjectToUser('p-1');
      expect(result).toEqual(project);
      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/courses/projects/p-1/copy', {});
    });
  });

  // ── Admin ────────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('should call GET /api/admin/users', async () => {
      const users = [{ user_id: 'u-1', email: 'a@b.com', username: 'alice', role: 'user', is_locked: false, created_at: null }];
      hoisted.mockClient.get.mockResolvedValueOnce({ data: users });
      const result = await listUsers();
      expect(result).toEqual(users);
      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/admin/users');
    });
  });

  describe('updateUserRole', () => {
    it('should call PUT /api/admin/users/:id/role', async () => {
      const updated = { user_id: 'u-1', email: 'a@b.com', username: 'alice', role: 'maintainer', is_locked: false, created_at: null };
      hoisted.mockClient.put.mockResolvedValueOnce({ data: updated });
      const result = await updateUserRole('u-1', { role: 'maintainer' });
      expect(result.role).toBe('maintainer');
      expect(hoisted.mockClient.put).toHaveBeenCalledWith('/api/admin/users/u-1/role', {
        role: 'maintainer',
      });
    });
  });
});
