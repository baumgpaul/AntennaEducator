import type { Project } from '@/types/models';

/** Where a project opens, by its simulation method. */
export function projectPath(project: Pick<Project, 'id' | 'kind'>): string {
  return `/project/${project.id}/${project.kind === 'fem' ? 'fem' : 'design'}`;
}
