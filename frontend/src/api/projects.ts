import apiClient from './client';
import type { Project } from '@/types/models';

/**
 * Projects API - CRUD operations for projects
 */

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

/**
 * Get all projects for the current user
 */
export async function getProjects(): Promise<Project[]> {
  const response = await apiClient.get<Project[]>('/projects');
  return response.data;
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<Project>(`/projects/${id}`);
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const response = await apiClient.post<Project>('/projects', data);
  return response.data;
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
  const response = await apiClient.patch<Project>(`/projects/${id}`, data);
  return response.data;
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}

/**
 * Duplicate a project
 */
export async function duplicateProject(id: string): Promise<Project> {
  const response = await apiClient.post<Project>(`/projects/${id}/duplicate`);
  return response.data;
}
