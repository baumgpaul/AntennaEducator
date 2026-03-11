/**
 * FDTD Solver API client — stub.
 *
 * Backend: http://localhost:8005  (VITE_SOLVER_FDTD_URL)
 */

import axios from 'axios';

const getSolverFdtdURL = () =>
  (import.meta.env.VITE_SOLVER_FDTD_URL as string) || 'http://localhost:8005';

export const solverFdtdClient = axios.create({
  baseURL: getSolverFdtdURL(),
  headers: { 'Content-Type': 'application/json' },
});

export const checkHealth = async () => {
  const { data } = await solverFdtdClient.get('/health');
  return data as { status: string; solver_type: string };
};
