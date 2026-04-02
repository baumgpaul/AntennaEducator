/**
 * Tests for Projects Redux slice.
 *
 * Run with: npm run test -- projectsSlice.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import projectsReducer, {
  setProjects,
  setSelectedProject,
  setLoading,
  setError,
  clearError
} from './projectsSlice';

import type { Project } from '../../types/models';

describe('projectsSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        projects: projectsReducer
      }
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().projects;

      expect(state.projects).toEqual([]);
      expect(state.selectedProject).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setProjects', () => {
    it('should set projects list', () => {
      const mockProjects: Project[] = [
        {
          id: 1,
          name: 'Dipole',
          description: 'Dipole antenna',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 2,
          name: 'Loop',
          description: 'Loop antenna',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      store.dispatch(setProjects(mockProjects));
      const state = store.getState().projects;

      expect(state.projects).toEqual(mockProjects);
      expect(state.projects.length).toBe(2);
    });

    it('should replace existing projects', () => {
      const firstProjects: Project[] = [
        {
          id: 1,
          name: 'First',
          description: 'First',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      const secondProjects: Project[] = [
        {
          id: 2,
          name: 'Second',
          description: 'Second',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      store.dispatch(setProjects(firstProjects));
      expect(store.getState().projects.projects).toEqual(firstProjects);

      store.dispatch(setProjects(secondProjects));
      expect(store.getState().projects.projects).toEqual(secondProjects);
    });

    it('should handle empty projects array', () => {
      store.dispatch(setProjects([]));
      expect(store.getState().projects.projects).toEqual([]);
    });
  });

  describe('setSelectedProject', () => {
    it('should set selected project', () => {
      const mockProject: Project = {
        id: 1,
        name: 'Test Project',
        description: 'Test',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      store.dispatch(setSelectedProject(mockProject));
      const state = store.getState().projects;

      expect(state.selectedProject).toEqual(mockProject);
      expect(state.selectedProject?.id).toBe(1);
    });

    it('should handle null value', () => {
      store.dispatch(setSelectedProject(null));
      expect(store.getState().projects.selectedProject).toBeNull();
    });

    it('should replace previous selection', () => {
      const project1: Project = {
        id: 1,
        name: 'Project 1',
        description: 'Description 1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const project2: Project = {
        id: 2,
        name: 'Project 2',
        description: 'Description 2',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      store.dispatch(setSelectedProject(project1));
      expect(store.getState().projects.selectedProject?.id).toBe(1);

      store.dispatch(setSelectedProject(project2));
      expect(store.getState().projects.selectedProject?.id).toBe(2);
    });
  });

  describe('setLoading', () => {
    it('should set loading state to true', () => {
      store.dispatch(setLoading(true));
      expect(store.getState().projects.loading).toBe(true);
    });

    it('should set loading state to false', () => {
      store.dispatch(setLoading(true));
      expect(store.getState().projects.loading).toBe(true);

      store.dispatch(setLoading(false));
      expect(store.getState().projects.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      const errorMsg = 'Failed to load projects';
      store.dispatch(setError(errorMsg));
      expect(store.getState().projects.error).toBe(errorMsg);
    });

    it('should replace previous error', () => {
      store.dispatch(setError('First error'));
      expect(store.getState().projects.error).toBe('First error');

      store.dispatch(setError('Second error'));
      expect(store.getState().projects.error).toBe('Second error');
    });

    it('should handle null error', () => {
      store.dispatch(setError(null));
      expect(store.getState().projects.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error message', () => {
      store.dispatch(setError('Some error'));
      expect(store.getState().projects.error).toBe('Some error');

      store.dispatch(clearError());
      expect(store.getState().projects.error).toBeNull();
    });

    it('should work when no error is set', () => {
      store.dispatch(clearError());
      expect(store.getState().projects.error).toBeNull();
    });
  });

  describe('combined state management', () => {
    it('should manage projects, selection, and loading together', () => {
      const projects: Project[] = [
        {
          id: 1,
          name: 'Project 1',
          description: 'Desc 1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];

      store.dispatch(setLoading(true));
      store.dispatch(setProjects(projects));
      store.dispatch(setSelectedProject(projects[0]));
      store.dispatch(setLoading(false));

      const state = store.getState().projects;
      expect(state.projects).toEqual(projects);
      expect(state.selectedProject).toEqual(projects[0]);
      expect(state.loading).toBe(false);
    });

    it('should handle error during loading', () => {
      store.dispatch(setLoading(true));
      store.dispatch(setError('Network error'));
      store.dispatch(setLoading(false));

      const state = store.getState().projects;
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
      expect(state.projects).toEqual([]);
    });

    it('should clear state properly', () => {
      // Set up state
      const project: Project = {
        id: 1,
        name: 'Test',
        description: 'Test',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      store.dispatch(setProjects([project]));
      store.dispatch(setSelectedProject(project));
      store.dispatch(setError('Some error'));

      // Clear state
      store.dispatch(setProjects([]));
      store.dispatch(setSelectedProject(null));
      store.dispatch(clearError());

      const state = store.getState().projects;
      expect(state.projects).toEqual([]);
      expect(state.selectedProject).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe('type safety', () => {
    it('should support both string and number IDs', () => {
      const projectNumId: Project = {
        id: 1,
        name: 'Numeric ID',
        description: 'Test',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const projectStrId: Project = {
        id: 'mock-1',
        name: 'String ID',
        description: 'Test',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      store.dispatch(setProjects([projectNumId, projectStrId]));
      const state = store.getState().projects;

      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].id).toBe(1);
      expect(state.projects[1].id).toBe('mock-1');
    });
  });
});
