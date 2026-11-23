/**
 * What a FEM project keeps of its computed results, so a reload shows the
 * same state as before: the mesh (domains, boundaries) and the solution,
 * each with the key of the model inputs it was computed from. Stored as
 * the project's simulation_results.femResult (the projects service puts it in S3).
 */
import type { MeshData, SolveResult } from './api';
import type { StudioState } from './studioState';

export interface SavedResults {
  version: 1;
  /** `data` is left out when it is the mesh of the result (stored once) */
  mesh?: { key: string; shapesKey: string; warnings: string[]; data?: MeshData };
  result?: { key: string; data: SolveResult };
}

export type Computed = Pick<StudioState, 'mesh' | 'result'>;

export function toSaved({ mesh, result }: Computed): SavedResults | null {
  if (!mesh && !result) return null;
  const saved: SavedResults = { version: 1 };
  if (mesh) {
    const { key, shapesKey, warnings, data } = mesh;
    saved.mesh = data === result?.data.mesh ? { key, shapesKey, warnings } : { key, shapesKey, warnings, data };
  }
  if (result) saved.result = { key: result.key, data: result.data };
  return saved;
}

export function fromSaved(value: unknown): Computed {
  const saved = value as SavedResults | null | undefined;
  if (!saved || typeof saved !== 'object' || saved.version !== 1) return {};
  const result = saved.result?.key && saved.result.data?.mesh ? saved.result : undefined;
  const meshData = saved.mesh?.data ?? result?.data.mesh;
  const mesh =
    saved.mesh?.key && meshData
      ? { key: saved.mesh.key, shapesKey: saved.mesh.shapesKey, warnings: saved.mesh.warnings ?? [], data: meshData }
      : undefined;
  const computed: Computed = {};
  if (mesh) computed.mesh = mesh;
  if (result) computed.result = result;
  return computed;
}
