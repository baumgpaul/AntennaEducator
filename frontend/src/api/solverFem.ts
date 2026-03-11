/**
 * FEM Solver API client — stub.
 *
 * Backend: http://localhost:8004  (VITE_SOLVER_FEM_URL)
 */

import axios from 'axios';

const getSolverFemURL = () =>
  (import.meta.env.VITE_SOLVER_FEM_URL as string) || 'http://localhost:8004';

export const solverFemClient = axios.create({
  baseURL: getSolverFemURL(),
  headers: { 'Content-Type': 'application/json' },
});

export const checkHealth = async () => {
  const { data } = await solverFemClient.get('/health');
  return data as { status: string; solver_type: string };
};
