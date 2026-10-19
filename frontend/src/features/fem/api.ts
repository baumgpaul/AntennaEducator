/** FEM service client (backend/fem); part of the FEM chunk, not the main bundle. */
import { createApiClient } from '@/api/client';
import { geometryOf, problemOf, type FemModel } from './model';

const client = createApiClient((import.meta.env.VITE_FEM_URL as string) || 'http://localhost:8020');

export interface MeshData {
  nodes: number[]; // x0, y0, x1, y1, …
  triangles: number[]; // 3 node indices per triangle
  triangle_domain: number[];
  domain_names: string[];
  edges: number[]; // 2 node indices per boundary edge
  boundaries: Record<string, number[]>; // name -> edge indices
  quality: number[];
  stats: {
    nodes: number;
    triangles: number;
    domains: Record<string, number>;
    boundaries: Record<string, number>;
    quality: { min: number; mean: number; histogram: number[]; bin_edges: number[] };
  };
}

export interface Issue {
  severity: 'error' | 'warning';
  step: 'materials' | 'physics' | 'mesh';
  message: string;
  why: string;
}

export interface SolveResult {
  mesh: MeshData;
  warnings: string[];
  issues: Issue[];
  potential: number[];
  electric_field: number[]; // Ex, Ey per triangle
  flux_density: number[];
  energy: number;
  energy_by_domain: Record<string, number>;
  charge: Record<string, number>;
  charge_from_flux: Record<string, number>;
  capacitance: { from_charge: number; from_energy: number; voltage: number } | null;
  permittivity: Record<string, number>;
  depth: number;
  info: {
    n_nodes: number;
    n_free: number;
    n_prescribed: number;
    n_elements: number;
    nonzeros: number;
    assembly_seconds: number;
    solve_seconds: number;
    relative_residual: number;
    method: string;
  };
  sparsity: { n: number; binned: boolean; grid?: number; rows: number[]; cols: number[] };
}

/** Error message from a FEM service response (FastAPI detail: text, or {message, issues}). */
export function femError(error: unknown): { message: string; issues: Issue[] } {
  const detail = (error as { details?: { detail?: unknown }; response?: { data?: { detail?: unknown } } })
    ?.details?.detail ?? (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const d = detail as { message: string; issues?: Issue[] };
    return { message: d.message, issues: d.issues ?? [] };
  }
  if (typeof detail === 'string') return { message: detail, issues: [] };
  if (Array.isArray(detail)) {
    return { message: detail.map((d: { msg?: string }) => d.msg).join('; '), issues: [] };
  }
  return { message: (error as Error)?.message || 'Request failed', issues: [] };
}

export async function meshModel(model: FemModel): Promise<{ mesh: MeshData; warnings: string[] }> {
  const r = await client.post('/api/fem/mesh', { geometry: geometryOf(model) });
  return r.data;
}

export async function checkModel(model: FemModel): Promise<{
  issues: Issue[];
  warnings: string[];
  domains: string[];
  boundaries: string[];
}> {
  const r = await client.post('/api/fem/check', { geometry: geometryOf(model), problem: problemOf(model) });
  return r.data;
}

export async function solveModel(model: FemModel): Promise<SolveResult> {
  const r = await client.post('/api/fem/solve', { geometry: geometryOf(model), problem: problemOf(model) });
  return r.data;
}

export async function exportOpenCfs(model: FemModel): Promise<Record<string, string>> {
  const r = await client.post('/api/fem/export/opencfs', { geometry: geometryOf(model), problem: problemOf(model) });
  return r.data.files;
}
