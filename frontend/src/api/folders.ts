/**
 * Folders & Courses API service
 * Handles folder CRUD, course browsing, deep copy, and admin operations
 */

import { projectsClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  parent_folder_id: string | null;
  is_course: boolean;
  source_course_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface FolderCreateRequest {
  name: string;
  parent_folder_id?: string | null;
}

export interface FolderUpdateRequest {
  name?: string;
  parent_folder_id?: string | null;
}

export interface DeepCopyRequest {
  target_folder_id?: string | null;
}

export interface UserRoleUpdateRequest {
  role: 'user' | 'maintainer' | 'admin';
}

export interface CourseOwnerUpdateRequest {
  new_owner_id: string;
}

export interface UserListItem {
  user_id: string;
  email: string;
  username: string;
  role: string;
  is_locked: boolean;
  created_at: string | null;
  simulation_tokens: number;
  flatrate_until: string | null;
}

export interface UserTokenUpdateRequest {
  action: 'set' | 'add';
  amount: number;
}

export interface UserFlatrateUpdateRequest {
  until: string | null;
}

export interface UsageLogItem {
  service: string;
  endpoint: string;
  cost: number;
  balance_after: number;
  was_flatrate: boolean;
  timestamp: string;
}

export interface EnrollRequest {
  user_id: string;
}

export interface EnrollmentItem {
  user_id: string;
  course_id: string;
  enrolled_at: string;
}

export interface ProjectListItem {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  folder_id: string | null;
  has_documentation: boolean;
  documentation_preview: string;
  source_project_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// User Folders
// ============================================================================

export async function getFolders(parentFolderId?: string | null): Promise<Folder[]> {
  const params: Record<string, string> = {};
  if (parentFolderId) params.parent_folder_id = parentFolderId;
  const response = await projectsClient.get<Folder[]>('/api/folders', { params });
  return response.data;
}

export async function getFolder(folderId: string): Promise<Folder> {
  const response = await projectsClient.get<Folder>(`/api/folders/${folderId}`);
  return response.data;
}

export async function createFolder(data: FolderCreateRequest): Promise<Folder> {
  const response = await projectsClient.post<Folder>('/api/folders', data);
  return response.data;
}

export async function updateFolder(folderId: string, data: FolderUpdateRequest): Promise<Folder> {
  const response = await projectsClient.put<Folder>(`/api/folders/${folderId}`, data);
  return response.data;
}

export async function deleteFolder(folderId: string): Promise<void> {
  await projectsClient.delete(`/api/folders/${folderId}`);
}

export async function getFolderContents(folderId: string): Promise<ProjectListItem[]> {
  const response = await projectsClient.get<ProjectListItem[]>(`/api/folders/${folderId}/contents`);
  return response.data;
}

// ============================================================================
// Public Courses
// ============================================================================

export async function getCourses(parentFolderId?: string | null): Promise<Folder[]> {
  const params: Record<string, string> = {};
  if (parentFolderId) params.parent_folder_id = parentFolderId;
  const response = await projectsClient.get<Folder[]>('/api/courses', { params });
  return response.data;
}

export async function getCourse(folderId: string): Promise<Folder> {
  const response = await projectsClient.get<Folder>(`/api/courses/${folderId}`);
  return response.data;
}

export async function createCourse(data: FolderCreateRequest): Promise<Folder> {
  const response = await projectsClient.post<Folder>('/api/courses', data);
  return response.data;
}

export async function updateCourse(folderId: string, data: FolderUpdateRequest): Promise<Folder> {
  const response = await projectsClient.put<Folder>(`/api/courses/${folderId}`, data);
  return response.data;
}

export async function deleteCourse(folderId: string): Promise<void> {
  await projectsClient.delete(`/api/courses/${folderId}`);
}

export async function getCourseProjects(folderId: string): Promise<ProjectListItem[]> {
  const response = await projectsClient.get<ProjectListItem[]>(`/api/courses/${folderId}/projects`);
  return response.data;
}

// ============================================================================
// Deep Copy
// ============================================================================

export async function copyCourseToUser(
  folderId: string,
  data: DeepCopyRequest = {},
): Promise<Folder> {
  const response = await projectsClient.post<Folder>(`/api/courses/${folderId}/copy`, data);
  return response.data;
}

export async function copyCourseProjectToUser(
  projectId: string,
  data: DeepCopyRequest = {},
): Promise<ProjectListItem> {
  const response = await projectsClient.post<ProjectListItem>(
    `/api/courses/projects/${projectId}/copy`,
    data,
  );
  return response.data;
}

// ============================================================================
// Admin
// ============================================================================

export async function updateUserRole(userId: string, data: UserRoleUpdateRequest): Promise<UserListItem> {
  const response = await projectsClient.put<UserListItem>(`/api/admin/users/${userId}/role`, data);
  return response.data;
}

export async function listUsers(): Promise<UserListItem[]> {
  const response = await projectsClient.get<UserListItem[]>('/api/admin/users');
  return response.data;
}

export async function assignCourseOwner(
  folderId: string,
  data: CourseOwnerUpdateRequest,
): Promise<Folder> {
  const response = await projectsClient.put<Folder>(`/api/admin/courses/${folderId}/owner`, data);
  return response.data;
}

export async function updateUserTokens(
  userId: string,
  data: UserTokenUpdateRequest,
): Promise<UserListItem> {
  const response = await projectsClient.put<UserListItem>(
    `/api/admin/users/${userId}/tokens`,
    data,
  );
  return response.data;
}

export async function updateUserFlatrate(
  userId: string,
  data: UserFlatrateUpdateRequest,
): Promise<UserListItem> {
  const response = await projectsClient.put<UserListItem>(
    `/api/admin/users/${userId}/flatrate`,
    data,
  );
  return response.data;
}

export async function getUserUsage(
  userId: string,
  limit?: number,
): Promise<UsageLogItem[]> {
  const params: Record<string, string> = {};
  if (limit) params.limit = String(limit);
  const response = await projectsClient.get<UsageLogItem[]>(
    `/api/admin/users/${userId}/usage`,
    { params },
  );
  return response.data;
}

export async function getOwnUsage(limit?: number): Promise<UsageLogItem[]> {
  const params: Record<string, string> = {};
  if (limit) params.limit = String(limit);
  const response = await projectsClient.get<UsageLogItem[]>('/api/usage', { params });
  return response.data;
}

export async function resetProjectToSource(projectId: string): Promise<ProjectListItem> {
  const response = await projectsClient.post<ProjectListItem>(`/api/projects/${projectId}/reset`);
  return response.data;
}

export async function enrollUser(
  courseId: string,
  data: EnrollRequest,
): Promise<void> {
  await projectsClient.post(`/api/admin/courses/${courseId}/enrollments`, data);
}

export async function unenrollUser(
  courseId: string,
  userId: string,
): Promise<void> {
  await projectsClient.delete(
    `/api/admin/courses/${courseId}/enrollments/${userId}`,
  );
}

export async function listCourseEnrollments(
  courseId: string,
): Promise<EnrollmentItem[]> {
  const response = await projectsClient.get<EnrollmentItem[]>(
    `/api/admin/courses/${courseId}/enrollments`,
  );
  return response.data;
}

export async function getMyCourses(): Promise<EnrollmentItem[]> {
  const response = await projectsClient.get<EnrollmentItem[]>('/api/my-courses');
  return response.data;
}

export async function updateUserLockStatus(
  userId: string,
  isLocked: boolean,
): Promise<UserListItem> {
  const response = await projectsClient.put<UserListItem>(
    `/api/admin/users/${userId}/lock`,
    { is_locked: isLocked },
  );
  return response.data;
}
