import { projectsClient } from './client';
import type { Project } from '@/types/models';
import * as mockApi from './mockProjects';

// Toggle between real API and mock API for testing
const USE_MOCK_API = false; // Real Projects API is now working!

/**
 * Projects API - CRUD operations for projects
 */

export interface CreateProjectRequest {
  name: string;
  description?: string;
  requested_fields?: any[];  // Field definitions for solver
  view_configurations?: any[];  // View configurations for postprocessing
  solver_state?: any;  // Solver results, state, and field data
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  requested_fields?: any[];  // Field definitions for solver
  view_configurations?: any[];  // View configurations for postprocessing
  solver_state?: any;  // Solver results, state, and field data
}

/**
 * Get all projects for the current user
 */
export async function getProjects(): Promise<Project[]> {
  if (USE_MOCK_API) return mockApi.getProjects();
  const response = await projectsClient.get<Project[]>('/api/v1/projects');
  return response.data;
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string | number): Promise<Project> {
  if (USE_MOCK_API) return mockApi.getProject(String(id));
  const response = await projectsClient.get<Project>(`/api/v1/projects/${id}`);
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  if (USE_MOCK_API) return mockApi.createProject(data);
  const response = await projectsClient.post<Project>('/api/v1/projects', data);
  return response.data;
}

/**
 * Update an existing project
 */
export async function updateProject(id: string | number, data: UpdateProjectRequest): Promise<Project> {
  if (USE_MOCK_API) return mockApi.updateProject(String(id), data);
  const response = await projectsClient.put<Project>(`/api/v1/projects/${id}`, data);
  return response.data;
}

/**
 * Delete a project
 */
export async function deleteProject(id: string | number): Promise<void> {
  if (USE_MOCK_API) return mockApi.deleteProject(String(id));
  await projectsClient.delete(`/api/v1/projects/${id}`);
}

/**
 * Duplicate a project
 * Note: Backend endpoint may need to be implemented if not available
 */
export async function duplicateProject(id: string | number): Promise<Project> {
  if (USE_MOCK_API) return mockApi.duplicateProject(String(id));
  const response = await projectsClient.post<Project>(`/api/v1/projects/${id}/duplicate`);
  return response.data;
}
