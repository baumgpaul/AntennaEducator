/**
 * Tests for Documentation Redux slice.
 *
 * Tests synchronous reducers and state transitions.
 * Async thunks are tested via their action/status effects.
 *
 * Run with: npm run test -- documentationSlice.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import documentationReducer, {
  togglePanel,
  openPanel,
  closePanel,
  setContent,
  clearDocumentation,
  clearError,
  fetchDocumentation,
  saveDocumentation,
  uploadImage,
  deleteImage,
  type DocumentationState,
} from './documentationSlice';

function createStore() {
  return configureStore({
    reducer: { documentation: documentationReducer },
  });
}

type TestStore = ReturnType<typeof createStore>;

describe('documentationSlice', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createStore();
  });

  // ── Initial state ──────────────────────────────────────────────────────

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = store.getState().documentation;

      expect(state.projectId).toBeNull();
      expect(state.content).toBe('');
      expect(state.version).toBe(1);
      expect(state.imageKeys).toEqual([]);
      expect(state.panelOpen).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.saving).toBe(false);
      expect(state.error).toBeNull();
      expect(state.dirty).toBe(false);
    });
  });

  // ── Panel visibility ────────────────────────────────────────────────────

  describe('panel visibility', () => {
    it('togglePanel should flip panelOpen', () => {
      expect(store.getState().documentation.panelOpen).toBe(false);

      store.dispatch(togglePanel());
      expect(store.getState().documentation.panelOpen).toBe(true);

      store.dispatch(togglePanel());
      expect(store.getState().documentation.panelOpen).toBe(false);
    });

    it('openPanel sets panelOpen to true', () => {
      store.dispatch(openPanel());
      expect(store.getState().documentation.panelOpen).toBe(true);

      // Calling again is idempotent
      store.dispatch(openPanel());
      expect(store.getState().documentation.panelOpen).toBe(true);
    });

    it('closePanel sets panelOpen to false', () => {
      store.dispatch(openPanel());
      store.dispatch(closePanel());
      expect(store.getState().documentation.panelOpen).toBe(false);
    });
  });

  // ── Content management ──────────────────────────────────────────────────

  describe('setContent', () => {
    it('should update content and mark dirty', () => {
      store.dispatch(setContent('# Hello'));
      const state = store.getState().documentation;

      expect(state.content).toBe('# Hello');
      expect(state.dirty).toBe(true);
    });

    it('should handle empty content', () => {
      store.dispatch(setContent('# Hello'));
      store.dispatch(setContent(''));
      const state = store.getState().documentation;

      expect(state.content).toBe('');
      expect(state.dirty).toBe(true);
    });
  });

  describe('clearDocumentation', () => {
    it('should reset all state except panelOpen', () => {
      // First set some state
      store.dispatch(setContent('# Test'));
      store.dispatch(openPanel());

      store.dispatch(clearDocumentation());
      const state = store.getState().documentation;

      expect(state.projectId).toBeNull();
      expect(state.content).toBe('');
      expect(state.version).toBe(1);
      expect(state.imageKeys).toEqual([]);
      expect(state.dirty).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.saving).toBe(false);
      expect(state.error).toBeNull();
      // panelOpen is reset too (intentional — clean state on project switch)
    });
  });

  describe('clearError', () => {
    it('should set error to null', () => {
      // Simulate an error via failed fetch
      store.dispatch(fetchDocumentation.rejected(new Error('fail'), 'test-req-id', 'proj-1'));
      expect(store.getState().documentation.error).toBeTruthy();

      store.dispatch(clearError());
      expect(store.getState().documentation.error).toBeNull();
    });
  });

  // ── Async thunk status transitions ──────────────────────────────────────

  describe('fetchDocumentation', () => {
    it('pending sets loading, clears error', () => {
      store.dispatch(fetchDocumentation.pending('req-id', 'proj-1'));
      const state = store.getState().documentation;

      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('fulfilled sets content and projectId, clears loading and dirty', () => {
      store.dispatch(setContent('old content'));

      store.dispatch(
        fetchDocumentation.fulfilled(
          { projectId: 'proj-1', content: '# Loaded', version: 3 },
          'req-id',
          'proj-1'
        )
      );
      const state = store.getState().documentation;

      expect(state.projectId).toBe('proj-1');
      expect(state.content).toBe('# Loaded');
      expect(state.version).toBe(3);
      expect(state.loading).toBe(false);
      expect(state.dirty).toBe(false);
    });

    it('rejected sets error, clears loading', () => {
      store.dispatch(
        fetchDocumentation.rejected(new Error('Network error'), 'req-id', 'proj-1')
      );
      const state = store.getState().documentation;

      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });

  describe('saveDocumentation', () => {
    it('pending sets saving, clears error', () => {
      store.dispatch(
        saveDocumentation.pending('req-id', { projectId: 'proj-1', content: '# Test' })
      );
      const state = store.getState().documentation;

      expect(state.saving).toBe(true);
      expect(state.error).toBeNull();
    });

    it('fulfilled updates content/version, clears saving and dirty', () => {
      store.dispatch(setContent('modified'));
      expect(store.getState().documentation.dirty).toBe(true);

      store.dispatch(
        saveDocumentation.fulfilled(
          { content: 'modified', version: 2 },
          'req-id',
          { projectId: 'proj-1', content: 'modified' }
        )
      );
      const state = store.getState().documentation;

      expect(state.content).toBe('modified');
      expect(state.version).toBe(2);
      expect(state.saving).toBe(false);
      expect(state.dirty).toBe(false);
    });

    it('rejected sets error, clears saving', () => {
      store.dispatch(
        saveDocumentation.rejected(
          new Error('Save failed'),
          'req-id',
          { projectId: 'proj-1', content: 'x' }
        )
      );
      const state = store.getState().documentation;

      expect(state.saving).toBe(false);
      expect(state.error).toBe('Save failed');
    });
  });

  describe('uploadImage', () => {
    it('fulfilled adds image key to imageKeys', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      store.dispatch(
        uploadImage.fulfilled(
          {
            upload_url: 'https://s3.example.com/put',
            image_key: 'img_abc123.png',
            s3_key: 'projects/p1/documentation/images/img_abc123.png',
            content_type: 'image/png',
          },
          'req-id',
          { projectId: 'proj-1', file }
        )
      );
      const state = store.getState().documentation;

      expect(state.imageKeys).toContain('img_abc123.png');
    });

    it('rejected sets error', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      store.dispatch(
        uploadImage.rejected(
          new Error('Upload fail'),
          'req-id',
          { projectId: 'proj-1', file }
        )
      );
      expect(store.getState().documentation.error).toBe('Upload fail');
    });
  });

  describe('deleteImage', () => {
    it('fulfilled removes image key from imageKeys', () => {
      // Seed with some keys
      const file = new File([''], 'a.png');
      store.dispatch(
        uploadImage.fulfilled(
          { upload_url: '', image_key: 'img_a.png', s3_key: '', content_type: 'image/png' },
          'req-id-1',
          { projectId: 'p1', file }
        )
      );
      store.dispatch(
        uploadImage.fulfilled(
          { upload_url: '', image_key: 'img_b.png', s3_key: '', content_type: 'image/png' },
          'req-id-2',
          { projectId: 'p1', file }
        )
      );
      expect(store.getState().documentation.imageKeys).toEqual(['img_a.png', 'img_b.png']);

      // Delete one
      store.dispatch(
        deleteImage.fulfilled('img_a.png', 'req-del', { projectId: 'p1', imageKey: 'img_a.png' })
      );
      expect(store.getState().documentation.imageKeys).toEqual(['img_b.png']);
    });

    it('rejected sets error', () => {
      store.dispatch(
        deleteImage.rejected(
          new Error('Delete fail'),
          'req-del',
          { projectId: 'p1', imageKey: 'img_x.png' }
        )
      );
      expect(store.getState().documentation.error).toBe('Delete fail');
    });
  });
});
