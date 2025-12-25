import type { Project } from '@/types/models';

// Mock data storage
let mockProjects: Project[] = [
  {
    id: '1',
    name: 'Dipole Antenna',
    description: 'Simple half-wave dipole antenna for 2.4 GHz',
    created_at: '2024-12-20T10:00:00Z',
    updated_at: '2024-12-20T10:00:00Z',
  },
  {
    id: '2',
    name: 'Patch Antenna',
    description: 'Microstrip patch antenna for GPS applications',
    created_at: '2024-12-21T14:30:00Z',
    updated_at: '2024-12-22T09:15:00Z',
  },
  {
    id: '3',
    name: 'Loop Antenna',
    description: 'Circular loop antenna for RFID reader',
    created_at: '2024-12-23T16:45:00Z',
    updated_at: '2024-12-23T16:45:00Z',
  },
];

let nextId = 4;

// Simulate network delay
const delay = (ms: number = 500) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock Projects API - In-memory CRUD operations for testing
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
  await delay();
  return [...mockProjects];
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  await delay();
  const project = mockProjects.find(p => p.id === id);
  if (!project) {
    throw new Error('Project not found');
  }
  return { ...project };
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectRequest): Promise<Project> {
  await delay();
  const now = new Date().toISOString();
  const newProject: Project = {
    id: String(nextId++),
    name: data.name,
    description: data.description,
    created_at: now,
    updated_at: now,
  };
  mockProjects.push(newProject);
  return { ...newProject };
}

/**
 * Update an existing project
 */
export async function updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
  await delay();
  const index = mockProjects.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error('Project not found');
  }
  
  const updated: Project = {
    ...mockProjects[index],
    ...data,
    updated_at: new Date().toISOString(),
  };
  mockProjects[index] = updated;
  return { ...updated };
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  await delay();
  const index = mockProjects.findIndex(p => p.id === id);
  if (index === -1) {
    throw new Error('Project not found');
  }
  mockProjects.splice(index, 1);
}

/**
 * Duplicate a project
 */
export async function duplicateProject(id: string): Promise<Project> {
  await delay();
  const original = mockProjects.find(p => p.id === id);
  if (!original) {
    throw new Error('Project not found');
  }
  
  const now = new Date().toISOString();
  const duplicate: Project = {
    id: String(nextId++),
    name: `${original.name} (Copy)`,
    description: original.description,
    created_at: now,
    updated_at: now,
  };
  mockProjects.push(duplicate);
  return { ...duplicate };
}
