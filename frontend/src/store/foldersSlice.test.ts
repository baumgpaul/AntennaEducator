/**
 * Tests for Folders Redux slice.
 *
 * Run with: npx vitest run src/store/foldersSlice.test.ts
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import foldersReducer, {
  setCurrentFolderId,
  setCurrentCourseId,
  clearFoldersError,
  selectFolderTree,
  selectCourseTree,
} from './foldersSlice';
import type { Folder } from '@/api/folders';

function createStore(preloadedFolders: Folder[] = [], preloadedCourses: Folder[] = []) {
  return configureStore({
    reducer: { folders: foldersReducer },
    preloadedState: {
      folders: {
        folders: preloadedFolders,
        currentFolderContents: [],
        currentFolderId: null,
        courses: preloadedCourses,
        currentCourseId: null,
        courseProjects: [],
        users: [],
        loading: false,
        courseLoading: false,
        adminLoading: false,
        copyLoading: false,
        error: null,
      },
    },
  });
}

const mockFolder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 'f-1',
  owner_id: 'u-1',
  name: 'Test Folder',
  parent_folder_id: null,
  is_course: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
});

describe('foldersSlice', () => {
  describe('initial state', () => {
    it('should have correct initial state', () => {
      const store = createStore();
      const state = store.getState().folders;

      expect(state.folders).toEqual([]);
      expect(state.courses).toEqual([]);
      expect(state.users).toEqual([]);
      expect(state.currentFolderId).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('synchronous reducers', () => {
    it('setCurrentFolderId sets current folder', () => {
      const store = createStore();
      store.dispatch(setCurrentFolderId('f-123'));
      expect(store.getState().folders.currentFolderId).toBe('f-123');
    });

    it('setCurrentFolderId accepts null for root', () => {
      const store = createStore();
      store.dispatch(setCurrentFolderId('f-123'));
      store.dispatch(setCurrentFolderId(null));
      expect(store.getState().folders.currentFolderId).toBeNull();
    });

    it('setCurrentCourseId sets current course', () => {
      const store = createStore();
      store.dispatch(setCurrentCourseId('c-1'));
      expect(store.getState().folders.currentCourseId).toBe('c-1');
    });

    it('clearError clears the error', () => {
      const store = createStore();
      // Manually set error via preloaded state
      const storeWithError = configureStore({
        reducer: { folders: foldersReducer },
        preloadedState: {
          folders: {
            ...store.getState().folders,
            error: 'some error',
          },
        },
      });
      storeWithError.dispatch(clearFoldersError());
      expect(storeWithError.getState().folders.error).toBeNull();
    });
  });

  describe('selectFolderTree', () => {
    it('returns empty array for no folders', () => {
      const store = createStore();
      const tree = selectFolderTree(store.getState());
      expect(tree).toEqual([]);
    });

    it('returns flat list as roots when no parents', () => {
      const folders = [
        mockFolder({ id: 'f-1', name: 'Folder A' }),
        mockFolder({ id: 'f-2', name: 'Folder B' }),
      ];
      const store = createStore(folders);
      const tree = selectFolderTree(store.getState());
      expect(tree).toHaveLength(2);
      expect(tree[0].name).toBe('Folder A');
      expect(tree[1].name).toBe('Folder B');
      expect(tree[0].children).toEqual([]);
    });

    it('builds nested tree from parent-child relationships', () => {
      const folders = [
        mockFolder({ id: 'f-1', name: 'Parent', parent_folder_id: null }),
        mockFolder({ id: 'f-2', name: 'Child', parent_folder_id: 'f-1' }),
        mockFolder({ id: 'f-3', name: 'Grandchild', parent_folder_id: 'f-2' }),
      ];
      const store = createStore(folders);
      const tree = selectFolderTree(store.getState());
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Parent');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('Child');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].name).toBe('Grandchild');
    });

    it('handles multiple roots with children', () => {
      const folders = [
        mockFolder({ id: 'f-1', name: 'Root A' }),
        mockFolder({ id: 'f-2', name: 'Root B' }),
        mockFolder({ id: 'f-3', name: 'Child of A', parent_folder_id: 'f-1' }),
        mockFolder({ id: 'f-4', name: 'Child of B', parent_folder_id: 'f-2' }),
      ];
      const store = createStore(folders);
      const tree = selectFolderTree(store.getState());
      expect(tree).toHaveLength(2);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[1].children).toHaveLength(1);
    });
  });

  describe('selectCourseTree', () => {
    it('builds nested course tree', () => {
      const courses = [
        mockFolder({ id: 'c-1', name: 'EM Basics', is_course: true }),
        mockFolder({ id: 'c-2', name: 'Dipole Theory', is_course: true, parent_folder_id: 'c-1' }),
      ];
      const store = createStore([], courses);
      const tree = selectCourseTree(store.getState());
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('EM Basics');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('Dipole Theory');
    });
  });
});
