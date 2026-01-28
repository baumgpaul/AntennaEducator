/**
 * Mock Service Worker handlers for testing
 * Intercepts API calls and returns mock responses
 */

import { http, HttpResponse } from 'msw';
import type { Project } from '@/types/models';

const API_URL = 'http://localhost:8010';

// Mock data
const mockProjects: Record<string | number, Project> = {
  1: {
    id: 1,
    name: 'Dipole Test',
    description: 'Test dipole antenna',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  2: {
    id: 2,
    name: 'Loop Test',
    description: 'Test loop antenna',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
};

export const handlers = [
  // GET /api/projects - List all projects
  http.get(`${API_URL}/api/projects`, () => {
    return HttpResponse.json(Object.values(mockProjects), { status: 200 });
  }),

  // GET /api/projects/:id - Get single project
  http.get(`${API_URL}/api/projects/:id`, ({ params }) => {
    const project = mockProjects[params.id as string | number];
    if (!project) {
      return HttpResponse.json(
        { detail: 'Project not found' },
        { status: 404 }
      );
    }
    return HttpResponse.json(project, { status: 200 });
  }),

  // POST /api/projects - Create project
  http.post(`${API_URL}/api/projects`, async ({ request }) => {
    const body = await request.json() as { name: string; description?: string };
    const newProject: Project = {
      id: Math.max(...Object.keys(mockProjects).map(Number)) + 1,
      name: body.name,
      description: body.description || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockProjects[newProject.id] = newProject;
    return HttpResponse.json(newProject, { status: 201 });
  }),

  // PUT /api/projects/:id - Update project
  http.put(`${API_URL}/api/projects/:id`, async ({ params, request }) => {
    const project = mockProjects[params.id as string | number];
    if (!project) {
      return HttpResponse.json(
        { detail: 'Project not found' },
        { status: 404 }
      );
    }

    const body = await request.json() as { name?: string; description?: string };
    const updated: Project = {
      ...project,
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      updated_at: new Date().toISOString(),
    };
    mockProjects[params.id as string | number] = updated;
    return HttpResponse.json(updated, { status: 200 });
  }),

  // DELETE /api/projects/:id - Delete project
  http.delete(`${API_URL}/api/projects/:id`, ({ params }) => {
    const project = mockProjects[params.id as string | number];
    if (!project) {
      return HttpResponse.json(
        { detail: 'Project not found' },
        { status: 404 }
      );
    }
    delete mockProjects[params.id as string | number];
    return HttpResponse.json(null, { status: 204 });
  }),

  // POST /api/projects/:id/duplicate - Duplicate project
  http.post(`${API_URL}/api/projects/:id/duplicate`, ({ params }) => {
    const original = mockProjects[params.id as string | number];
    if (!original) {
      return HttpResponse.json(
        { detail: 'Project not found' },
        { status: 404 }
      );
    }

    const duplicate: Project = {
      id: Math.max(...Object.keys(mockProjects).map(Number)) + 1,
      name: `${original.name} (Copy)`,
      description: original.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockProjects[duplicate.id] = duplicate;
    return HttpResponse.json(duplicate, { status: 201 });
  }),
];
