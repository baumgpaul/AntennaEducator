// Redux store configuration
export { default as store } from './store'
export type { RootState, AppDispatch } from './store'
export * from './hooks'

// Export slices
export * from './authSlice'
export * from './projectsSlice'
export * from './designSlice'
export * from './uiSlice'
export {
  // Actions
  setCurrentFolderId,
  setCurrentCourseId,
  clearFoldersError,
  // Thunks
  fetchFolders,
  fetchFolderContents,
  createFolder,
  updateFolder,
  deleteFolder,
  fetchCourses,
  fetchCourseProjects,
  createCourse,
  updateCourse,
  deleteCourse,
  copyCourseToUser,
  copyCourseProjectToUser,
  fetchUsers,
  updateUserRole,
  assignCourseOwner,
  // Selectors
  selectFolders,
  selectFolderContents,
  selectCurrentFolderId,
  selectCourses,
  selectCourseProjects,
  selectUsers,
  selectFoldersLoading,
  selectCourseLoading,
  selectAdminLoading,
  selectCopyLoading,
  selectFoldersError,
  selectFolderTree,
  selectCourseTree,
} from './foldersSlice'
export type { Folder, ProjectListItem, UserListItem, FolderTreeNode } from './foldersSlice'
