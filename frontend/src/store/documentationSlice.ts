/**
 * Documentation state slice
 *
 * Manages per-project documentation content (markdown + images).
 * Content is stored in S3, only the state/loading flags live in Redux.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import * as documentationApi from '@/api/documentation'
import type { DocumentationContent, ImageUploadResponse } from '@/api/documentation'

// ── State ────────────────────────────────────────────────────────────────────

export interface DocumentationState {
  /** Current project ID whose documentation is loaded. */
  projectId: string | null
  /** Markdown content (empty string = no documentation). */
  content: string
  /** Content version from backend. */
  version: number
  /** Image keys currently associated with the documentation. */
  imageKeys: string[]
  /** Whether the panel is visible. */
  panelOpen: boolean
  /** Loading / saving flags. */
  loading: boolean
  saving: boolean
  /** Error message (null = no error). */
  error: string | null
  /** Dirty flag — content was edited but not yet saved. */
  dirty: boolean
}

const initialState: DocumentationState = {
  projectId: null,
  content: '',
  version: 1,
  imageKeys: [],
  panelOpen: false,
  loading: false,
  saving: false,
  error: null,
  dirty: false,
}

// ── Async Thunks ─────────────────────────────────────────────────────────────

/** Load documentation content for a project. */
export const fetchDocumentation = createAsyncThunk(
  'documentation/fetch',
  async (projectId: string) => {
    const data = await documentationApi.getDocumentation(projectId)
    return { projectId, ...data }
  }
)

/** Save documentation content for a project. */
export const saveDocumentation = createAsyncThunk(
  'documentation/save',
  async ({ projectId, content }: { projectId: string; content: string }) => {
    const data = await documentationApi.saveDocumentation(projectId, content)
    return data
  }
)

/** Request presigned upload URL, upload image to S3, return metadata. */
export const uploadImage = createAsyncThunk(
  'documentation/uploadImage',
  async ({
    projectId,
    file,
  }: {
    projectId: string
    file: File
  }): Promise<ImageUploadResponse> => {
    // 1. Request presigned URL from backend
    const uploadInfo = await documentationApi.requestImageUpload(
      projectId,
      file.name,
      file.type || undefined
    )
    // 2. Direct upload to S3
    await documentationApi.uploadImageToS3(uploadInfo.upload_url, file, uploadInfo.content_type)
    return uploadInfo
  }
)

/** Delete an image from S3 and remove its key from state. */
export const deleteImage = createAsyncThunk(
  'documentation/deleteImage',
  async ({ projectId, imageKey }: { projectId: string; imageKey: string }) => {
    await documentationApi.deleteImage(projectId, imageKey)
    return imageKey
  }
)

/** Resolve a presigned GET URL for an image. */
export const resolveImageUrl = createAsyncThunk(
  'documentation/resolveImageUrl',
  async ({ projectId, imageKey }: { projectId: string; imageKey: string }) => {
    const url = await documentationApi.getImageUrl(projectId, imageKey)
    return { imageKey, url }
  }
)

// ── Slice ────────────────────────────────────────────────────────────────────

const documentationSlice = createSlice({
  name: 'documentation',
  initialState,
  reducers: {
    /** Toggle the documentation panel visibility. */
    togglePanel(state) {
      state.panelOpen = !state.panelOpen
    },
    /** Open the documentation panel. */
    openPanel(state) {
      state.panelOpen = true
    },
    /** Close the documentation panel. */
    closePanel(state) {
      state.panelOpen = false
    },
    /** Update content locally (marks dirty). */
    setContent(state, action: PayloadAction<string>) {
      state.content = action.payload
      state.dirty = true
    },
    /** Clear documentation state (e.g., when switching project). */
    clearDocumentation(state) {
      state.projectId = null
      state.content = ''
      state.version = 1
      state.imageKeys = []
      state.loading = false
      state.saving = false
      state.error = null
      state.dirty = false
    },
    /** Clear error. */
    clearError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // ── fetch ──
    builder
      .addCase(fetchDocumentation.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDocumentation.fulfilled, (state, action) => {
        state.projectId = action.payload.projectId
        state.content = action.payload.content
        state.version = action.payload.version
        state.loading = false
        state.dirty = false
      })
      .addCase(fetchDocumentation.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to load documentation'
      })

    // ── save ──
    builder
      .addCase(saveDocumentation.pending, (state) => {
        state.saving = true
        state.error = null
      })
      .addCase(saveDocumentation.fulfilled, (state, action) => {
        state.content = action.payload.content
        state.version = action.payload.version
        state.saving = false
        state.dirty = false
      })
      .addCase(saveDocumentation.rejected, (state, action) => {
        state.saving = false
        state.error = action.error.message || 'Failed to save documentation'
      })

    // ── uploadImage ──
    builder
      .addCase(uploadImage.fulfilled, (state, action) => {
        state.imageKeys.push(action.payload.image_key)
      })
      .addCase(uploadImage.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to upload image'
      })

    // ── deleteImage ──
    builder
      .addCase(deleteImage.fulfilled, (state, action) => {
        state.imageKeys = state.imageKeys.filter((k) => k !== action.payload)
      })
      .addCase(deleteImage.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete image'
      })
  },
})

export const {
  togglePanel,
  openPanel,
  closePanel,
  setContent,
  clearDocumentation,
  clearError,
} = documentationSlice.actions

export default documentationSlice.reducer
