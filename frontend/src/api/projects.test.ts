/**
 * Tests for Projects API client.
 *
 * Run with: npm run test -- projects.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  duplicateProject
} from './projects';

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

describe('Projects API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should fetch all projects', async () => {
      const mockProjects = [
        { id: 1, name: 'Dipole', description: 'Dipole antenna', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
        { id: 2, name: 'Loop', description: 'Loop antenna', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
      ];

      hoisted.mockClient.get.mockResolvedValue({ data: mockProjects });

      const result = await getProjects();

      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/projects');
      expect(result).toEqual(mockProjects);
      expect(result.length).toBe(2);
    });

    it('should handle empty project list', async () => {
      hoisted.mockClient.get.mockResolvedValue({ data: [] });

      const result = await getProjects();

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should handle API errors', async () => {
      const error = new Error('Network error');
      hoisted.mockClient.get.mockRejectedValue(error);

      await expect(getProjects()).rejects.toThrow('Network error');
    });
  });

  describe('getProject', () => {
    it('should fetch a single project by ID', async () => {
      const mockProject = {
        id: 1,
        name: 'Dipole',
        description: 'Dipole antenna',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      hoisted.mockClient.get.mockResolvedValue({ data: mockProject });

      const result = await getProject(1);

      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/projects/1');
      expect(result).toEqual(mockProject);
      expect(result.name).toBe('Dipole');
    });

    it('should handle string IDs', async () => {
      const mockProject = {
        id: '1',
        name: 'Project',
        description: 'Description',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      hoisted.mockClient.get.mockResolvedValue({ data: mockProject });

      const result = await getProject('1');

      expect(hoisted.mockClient.get).toHaveBeenCalledWith('/api/projects/1');
      expect(result.id).toBe('1');
    });

    it('should handle 404 errors', async () => {
      const error = new Error('Not found');
      hoisted.mockClient.get.mockRejectedValue(error);

      await expect(getProject(9999)).rejects.toThrow('Not found');
    });
  });

  describe('createProject', () => {
    it('should create a new project', async () => {
      const newProject = { name: 'New Antenna', description: 'Test antenna' };
      const createdProject = {
        id: 1,
        ...newProject,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      hoisted.mockClient.post.mockResolvedValue({ data: createdProject });

      const result = await createProject(newProject);

      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/projects', newProject);
      expect(result).toEqual(createdProject);
      expect(result.id).toBe(1);
    });

    it('should handle missing required fields', async () => {
      const invalidProject = { description: 'No name' };
      const error = new Error('Name is required');
      hoisted.mockClient.post.mockRejectedValue(error);

      await expect(createProject(invalidProject as any)).rejects.toThrow('Name is required');
    });

    it('should handle server errors', async () => {
      const newProject = { name: 'Test', description: 'Test' };
      const error = new Error('Internal server error');
      hoisted.mockClient.post.mockRejectedValue(error);

      await expect(createProject(newProject)).rejects.toThrow('Internal server error');
    });
  });

  describe('updateProject', () => {
    it('should update a project', async () => {
      const updateData = { name: 'Updated Name' };
      const updatedProject = {
        id: 1,
        name: 'Updated Name',
        description: 'Original description',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z'
      };

      hoisted.mockClient.put.mockResolvedValue({ data: updatedProject });

      const result = await updateProject(1, updateData);

      expect(hoisted.mockClient.put).toHaveBeenCalledWith('/api/projects/1', updateData);
      expect(result).toEqual(updatedProject);
      expect(result.name).toBe('Updated Name');
    });

    it('should update partial fields', async () => {
      const updateData = { description: 'New description' };
      const updatedProject = {
        id: 1,
        name: 'Original Name',
        description: 'New description',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z'
      };

      hoisted.mockClient.put.mockResolvedValue({ data: updatedProject });

      const result = await updateProject(1, updateData);

      expect(result.name).toBe('Original Name');
      expect(result.description).toBe('New description');
    });

    it('should handle project not found', async () => {
      const error = new Error('Project not found');
      hoisted.mockClient.put.mockRejectedValue(error);

      await expect(updateProject(9999, { name: 'Test' })).rejects.toThrow('Project not found');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      hoisted.mockClient.delete.mockResolvedValue({ status: 204 });

      const result = await deleteProject(1);

      expect(hoisted.mockClient.delete).toHaveBeenCalledWith('/api/projects/1');
      expect(result).toBeUndefined();
    });

    it('should handle string IDs', async () => {
      hoisted.mockClient.delete.mockResolvedValue({ status: 204 });

      await deleteProject('1');

      expect(hoisted.mockClient.delete).toHaveBeenCalledWith('/api/projects/1');
    });

    it('should handle 404 errors', async () => {
      const error = new Error('Project not found');
      hoisted.mockClient.delete.mockRejectedValue(error);

      await expect(deleteProject(9999)).rejects.toThrow('Project not found');
    });
  });

  describe('duplicateProject', () => {
    it('should duplicate a project', async () => {
      const duplicatedProject = {
        id: 2,
        name: 'Dipole (Copy)',
        description: 'Original description',
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z'
      };

      hoisted.mockClient.post.mockResolvedValue({ data: duplicatedProject });

      const result = await duplicateProject(1);

      expect(hoisted.mockClient.post).toHaveBeenCalledWith('/api/projects/1/duplicate');
      expect(result).toEqual(duplicatedProject);
      expect(result.id).not.toBe(1);
    });

    it('should handle missing source project', async () => {
      const error = new Error('Source project not found');
      hoisted.mockClient.post.mockRejectedValue(error);

      await expect(duplicateProject(9999)).rejects.toThrow('Source project not found');
    });
  });
});
