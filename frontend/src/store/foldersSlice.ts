/**
 * Folders & Courses state slice
 * Manages folder tree, course library, and admin operations
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from './store';
import * as foldersApi from '@/api/folders';
import type {
  Folder,
  ProjectListItem,
  UserListItem,
  FolderCreateRequest,
  FolderUpdateRequest,
  DeepCopyRequest,
  UserRoleUpdateRequest,
  CourseOwnerUpdateRequest,
  UserTokenUpdateRequest,
  UserFlatrateUpdateRequest,
} from '@/api/folders';

// Re-export types for consumers
export type { Folder, ProjectListItem, UserListItem } from '@/api/folders';

// ============================================================================
// State
// ============================================================================

interface FoldersState {
  // User folders
  folders: Folder[];
  currentFolderContents: ProjectListItem[];
  currentFolderId: string | null; // null = root

  // Courses
  courses: Folder[];
  currentCourseId: string | null;
  courseProjects: ProjectListItem[];

  // Admin
  users: UserListItem[];

  // Loading states
  loading: boolean;
  courseLoading: boolean;
  adminLoading: boolean;
  copyLoading: boolean;
  error: string | null;
}

const initialState: FoldersState = {
  folders: [],
  currentFolderContents: [],
  currentFolderId: null,
  courses: [],
  currentCourseId: null,
  courseProjects: [],
  users: [],
  loading: false,
  courseLoading: false,
  adminLoading: false,
  copyLoading: false,
  error: null,
};

// ============================================================================
// Async Thunks — User Folders
// ============================================================================

export const fetchFolders = createAsyncThunk<Folder[], string | null | void>(
  'folders/fetchFolders',
  async (parentFolderId) => {
    const id = typeof parentFolderId === 'string' ? parentFolderId : undefined;
    return await foldersApi.getFolders(id);
  },
);

export const fetchFolderContents = createAsyncThunk(
  'folders/fetchFolderContents',
  async (folderId: string) => {
    return await foldersApi.getFolderContents(folderId);
  },
);

export const createFolder = createAsyncThunk(
  'folders/createFolder',
  async (data: FolderCreateRequest) => {
    return await foldersApi.createFolder(data);
  },
);

export const updateFolder = createAsyncThunk(
  'folders/updateFolder',
  async ({ folderId, data }: { folderId: string; data: FolderUpdateRequest }) => {
    return await foldersApi.updateFolder(folderId, data);
  },
);

export const deleteFolder = createAsyncThunk(
  'folders/deleteFolder',
  async (folderId: string) => {
    await foldersApi.deleteFolder(folderId);
    return folderId;
  },
);

// ============================================================================
// Async Thunks — Courses
// ============================================================================

export const fetchCourses = createAsyncThunk<Folder[], string | null | void>(
  'folders/fetchCourses',
  async (parentFolderId) => {
    const id = typeof parentFolderId === 'string' ? parentFolderId : undefined;
    return await foldersApi.getCourses(id);
  },
);

export const fetchCourseProjects = createAsyncThunk(
  'folders/fetchCourseProjects',
  async (folderId: string) => {
    return await foldersApi.getCourseProjects(folderId);
  },
);

export const createCourse = createAsyncThunk(
  'folders/createCourse',
  async (data: FolderCreateRequest) => {
    return await foldersApi.createCourse(data);
  },
);

export const updateCourse = createAsyncThunk(
  'folders/updateCourse',
  async ({ folderId, data }: { folderId: string; data: FolderUpdateRequest }) => {
    return await foldersApi.updateCourse(folderId, data);
  },
);

export const deleteCourse = createAsyncThunk(
  'folders/deleteCourse',
  async (folderId: string) => {
    await foldersApi.deleteCourse(folderId);
    return folderId;
  },
);

// ============================================================================
// Async Thunks — Deep Copy
// ============================================================================

export const copyCourseToUser = createAsyncThunk(
  'folders/copyCourseToUser',
  async ({ folderId, data }: { folderId: string; data?: DeepCopyRequest }) => {
    return await foldersApi.copyCourseToUser(folderId, data);
  },
);

export const copyCourseProjectToUser = createAsyncThunk(
  'folders/copyCourseProjectToUser',
  async ({ projectId, data }: { projectId: string; data?: DeepCopyRequest }) => {
    return await foldersApi.copyCourseProjectToUser(projectId, data);
  },
);

// ============================================================================
// Async Thunks — Admin
// ============================================================================

export const fetchUsers = createAsyncThunk('folders/fetchUsers', async () => {
  return await foldersApi.listUsers();
});

export const updateUserRole = createAsyncThunk(
  'folders/updateUserRole',
  async ({ userId, data }: { userId: string; data: UserRoleUpdateRequest }) => {
    return await foldersApi.updateUserRole(userId, data);
  },
);

export const assignCourseOwner = createAsyncThunk(
  'folders/assignCourseOwner',
  async ({ folderId, data }: { folderId: string; data: CourseOwnerUpdateRequest }) => {
    return await foldersApi.assignCourseOwner(folderId, data);
  },
);

export const updateUserTokens = createAsyncThunk(
  'folders/updateUserTokens',
  async ({ userId, data }: { userId: string; data: UserTokenUpdateRequest }) => {
    return await foldersApi.updateUserTokens(userId, data);
  },
);

export const updateUserFlatrate = createAsyncThunk(
  'folders/updateUserFlatrate',
  async ({ userId, data }: { userId: string; data: UserFlatrateUpdateRequest }) => {
    return await foldersApi.updateUserFlatrate(userId, data);
  },
);

// ============================================================================
// Slice
// ============================================================================

const foldersSlice = createSlice({
  name: 'folders',
  initialState,
  reducers: {
    setCurrentFolderId: (state, action: PayloadAction<string | null>) => {
      state.currentFolderId = action.payload;
    },
    setCurrentCourseId: (state, action: PayloadAction<string | null>) => {
      state.currentCourseId = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // ── User Folders ───────────────────────────────────────────────────────
    builder
      .addCase(fetchFolders.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFolders.fulfilled, (state, action) => {
        state.loading = false;
        state.folders = action.payload;
      })
      .addCase(fetchFolders.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch folders';
      });

    builder
      .addCase(fetchFolderContents.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchFolderContents.fulfilled, (state, action) => {
        state.loading = false;
        state.currentFolderContents = action.payload;
      })
      .addCase(fetchFolderContents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch folder contents';
      });

    builder
      .addCase(createFolder.fulfilled, (state, action) => {
        state.folders.push(action.payload);
      })
      .addCase(createFolder.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to create folder';
      });

    builder.addCase(updateFolder.fulfilled, (state, action) => {
      const idx = state.folders.findIndex((f) => f.id === action.payload.id);
      if (idx !== -1) state.folders[idx] = action.payload;
    });

    builder.addCase(deleteFolder.fulfilled, (state, action) => {
      state.folders = state.folders.filter((f) => f.id !== action.payload);
    });

    // ── Courses ────────────────────────────────────────────────────────────
    builder
      .addCase(fetchCourses.pending, (state) => {
        state.courseLoading = true;
        state.error = null;
      })
      .addCase(fetchCourses.fulfilled, (state, action) => {
        state.courseLoading = false;
        state.courses = action.payload;
      })
      .addCase(fetchCourses.rejected, (state, action) => {
        state.courseLoading = false;
        state.error = action.error.message || 'Failed to fetch courses';
      });

    builder
      .addCase(fetchCourseProjects.pending, (state) => {
        state.courseLoading = true;
      })
      .addCase(fetchCourseProjects.fulfilled, (state, action) => {
        state.courseLoading = false;
        state.courseProjects = action.payload;
      })
      .addCase(fetchCourseProjects.rejected, (state, action) => {
        state.courseLoading = false;
        state.error = action.error.message || 'Failed to fetch course projects';
      });

    builder
      .addCase(createCourse.fulfilled, (state, action) => {
        state.courses.push(action.payload);
      })
      .addCase(createCourse.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to create course';
      });

    builder.addCase(updateCourse.fulfilled, (state, action) => {
      const idx = state.courses.findIndex((f) => f.id === action.payload.id);
      if (idx !== -1) state.courses[idx] = action.payload;
    });

    builder.addCase(deleteCourse.fulfilled, (state, action) => {
      state.courses = state.courses.filter((f) => f.id !== action.payload);
    });

    // ── Deep Copy ──────────────────────────────────────────────────────────
    builder
      .addCase(copyCourseToUser.pending, (state) => {
        state.copyLoading = true;
      })
      .addCase(copyCourseToUser.fulfilled, (state) => {
        state.copyLoading = false;
      })
      .addCase(copyCourseToUser.rejected, (state, action) => {
        state.copyLoading = false;
        state.error = action.error.message || 'Failed to copy course';
      });

    builder
      .addCase(copyCourseProjectToUser.pending, (state) => {
        state.copyLoading = true;
      })
      .addCase(copyCourseProjectToUser.fulfilled, (state) => {
        state.copyLoading = false;
      })
      .addCase(copyCourseProjectToUser.rejected, (state, action) => {
        state.copyLoading = false;
        state.error = action.error.message || 'Failed to copy project';
      });

    // ── Admin ──────────────────────────────────────────────────────────────
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.adminLoading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.adminLoading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.adminLoading = false;
        state.error = action.error.message || 'Failed to fetch users';
      });

    builder.addCase(updateUserRole.fulfilled, (state, action) => {
      const idx = state.users.findIndex((u) => u.user_id === action.payload.user_id);
      if (idx !== -1) state.users[idx] = action.payload;
    });

    builder.addCase(assignCourseOwner.fulfilled, (state, action) => {
      const idx = state.courses.findIndex((c) => c.id === action.payload.id);
      if (idx !== -1) state.courses[idx] = action.payload;
    });

    builder.addCase(updateUserTokens.fulfilled, (state, action) => {
      const idx = state.users.findIndex((u) => u.user_id === action.payload.user_id);
      if (idx !== -1) state.users[idx] = action.payload;
    });

    builder.addCase(updateUserFlatrate.fulfilled, (state, action) => {
      const idx = state.users.findIndex((u) => u.user_id === action.payload.user_id);
      if (idx !== -1) state.users[idx] = action.payload;
    });
  },
});

export const { setCurrentFolderId, setCurrentCourseId, clearError: clearFoldersError } = foldersSlice.actions;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectFolders = (state: RootState) => state.folders.folders;
export const selectFolderContents = (state: RootState) => state.folders.currentFolderContents;
export const selectCurrentFolderId = (state: RootState) => state.folders.currentFolderId;
export const selectCourses = (state: RootState) => state.folders.courses;
export const selectCourseProjects = (state: RootState) => state.folders.courseProjects;
export const selectUsers = (state: RootState) => state.folders.users;
export const selectFoldersLoading = (state: RootState) => state.folders.loading;
export const selectCourseLoading = (state: RootState) => state.folders.courseLoading;
export const selectAdminLoading = (state: RootState) => state.folders.adminLoading;
export const selectCopyLoading = (state: RootState) => state.folders.copyLoading;
export const selectFoldersError = (state: RootState) => state.folders.error;

/** Build a nested tree from the flat folder list. */
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}

export const selectFolderTree = (state: RootState): FolderTreeNode[] => {
  const flat = state.folders.folders;
  const map = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  flat.forEach((f) => map.set(f.id, { ...f, children: [] }));
  flat.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parent_folder_id && map.has(f.parent_folder_id)) {
      map.get(f.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

export const selectCourseTree = (state: RootState): FolderTreeNode[] => {
  const flat = state.folders.courses;
  const map = new Map<string, FolderTreeNode>();
  const roots: FolderTreeNode[] = [];

  flat.forEach((f) => map.set(f.id, { ...f, children: [] }));
  flat.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parent_folder_id && map.has(f.parent_folder_id)) {
      map.get(f.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
};

export default foldersSlice.reducer;
