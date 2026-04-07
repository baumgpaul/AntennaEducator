import { projectsClient } from './client';
import type { Project } from '@/types/models';

/**
 * Projects API - CRUD operations for projects
 */

export interface CreateProjectRequest {
  name: string;
  description?: string;
  design_state?: Record<string, any>;
  simulation_config?: Record<string, any>;
  simulation_results?: Record<string, any>;
  ui_state?: Record<string, any>;
  folder_id?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  design_state?: Record<string, any>;
  simulation_config?: Record<string, any>;
  simulation_results?: Record<string, any>;
  ui_state?: Record<string, any>;
  folder_id?: string | null;
}

/**
 * Get all projects for the current user
 */
export async function getProjects(): Promise<Project[]> {
  const response = await projectsClient.get<Project[]>('/api/projects');
  return response.data;
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string | number): Promise<Project> {
  const response = await projectsClient.get<Project>(`/api/projects/${id}`);
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  const response = await projectsClient.post<Project>('/api/projects', data);
  return response.data;
}

/**
 * Update an existing project
 */
export async function updateProject(id: string | number, data: UpdateProjectRequest): Promise<Project> {
  const response = await projectsClient.put<Project>(`/api/projects/${id}`, data);
  return response.data;
}

/**
 * Delete a project
 */
export async function deleteProject(id: string | number): Promise<void> {
  await projectsClient.delete(`/api/projects/${id}`);
}

/**
 * Duplicate a project
 * Note: Backend endpoint may need to be implemented if not available
 */
export async function duplicateProject(id: string | number): Promise<Project> {
  const response = await projectsClient.post<Project>(`/api/projects/${id}/duplicate`);
  return response.data;
}
