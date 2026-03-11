/**
 * MoM Solver API client — stub.
 *
 * Backend: http://localhost:8006  (VITE_SOLVER_MOM_URL)
 */

import axios from 'axios';

const getSolverMomURL = () =>
  (import.meta.env.VITE_SOLVER_MOM_URL as string) || 'http://localhost:8006';

export const solverMomClient = axios.create({
  baseURL: getSolverMomURL(),
  headers: { 'Content-Type': 'application/json' },
});

export const checkHealth = async () => {
  const { data } = await solverMomClient.get('/health');
  return data as { status: string; solver_type: string };
};
