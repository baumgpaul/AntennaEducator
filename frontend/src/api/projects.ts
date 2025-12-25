import apiClient from './client';
import type { Project } from '@/types/models';
import * as mockApi from './mockProjects';

// Toggle between real API and mock API for testing
const USE_MOCK_API = true; // Set to false when backend is ready

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
  if (USE_MOCK_API) return mockApi.getProjects();
  const response = await apiClient.get<Project[]>('/projects');
  return response.data;
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  if (USE_MOCK_API) return mockApi.getProject(id);
  const response = await apiClient.get<Project>(`/projects/${id}`);
  return response.data;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  if (USE_MOCK_API) return mockApi.createProject(data);
  const response = await apiClient.post<Project>('/projects', data);
  return response.data;
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
  if (USE_MOCK_API) return mockApi.updateProject(id, data);
  const response = await apiClient.patch<Project>(`/projects/${id}`, data);
  return response.data;
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  if (USE_MOCK_API) return mockApi.deleteProject(id);
  await apiClient.delete(`/projects/${id}`);
}

/**
 * Duplicate a project
 */
export async function duplicateProject(id: string): Promise<Project> {
  if (USE_MOCK_API) return mockApi.duplicateProject(id);
  const response = await apiClient.post<Project>(`/projects/${id}/duplicate`);
  return response.data;
}
