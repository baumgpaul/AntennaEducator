import { useCallback, useEffect, useMemo, useState } from 'react';
import { femError, meshModel, solveModel, exportOpenCfs, type Issue } from './api';
import { EMPTY_MODEL, type FemModel } from './model';
import { meshKey, progress, shapesKey, solveKey, type StudioState } from './studioState';

const STORAGE_KEY = 'fem-studio-model';

function loadDraft(): FemModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const m = JSON.parse(raw) as FemModel;
      if (m.version === 1) return m;
    }
  } catch {
    /* private mode, corrupt draft: start empty */
  }
  return EMPTY_MODEL;
}

/** Model, results and actions of FEM Studio. The model is kept as a draft in this browser. */
export function useFemStudio() {
  const [state, setState] = useState<StudioState>(() => ({ model: loadDraft(), issues: [] }));
  const [busy, setBusy] = useState<null | 'mesh' | 'solve' | 'export'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.model));
    } catch {
      /* draft only */
    }
  }, [state.model]);

  const update = useCallback((change: (m: FemModel) => FemModel) => {
    setState((s) => ({ ...s, model: change(s.model), issues: [] }));
    setError(null);
  }, []);

  const load = useCallback((model: FemModel) => {
    setState({ model: structuredClone(model), issues: [] });
    setError(null);
  }, []);

  const fail = (e: unknown) => {
    const { message, issues } = femError(e);
    setError(message);
    setState((s) => ({ ...s, issues }));
  };

  const runMesh = useCallback(async () => {
    const model = state.model;
    setBusy('mesh');
    setError(null);
    try {
      const r = await meshModel(model);
      setState((s) => ({
        ...s,
        mesh: { key: meshKey(model), shapesKey: shapesKey(model), data: r.mesh, warnings: r.warnings },
      }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [state.model]);

  const runSolve = useCallback(async () => {
    const model = state.model;
    setBusy('solve');
    setError(null);
    try {
      const r = await solveModel(model);
      setState((s) => ({
        ...s,
        issues: r.issues as Issue[],
        mesh: { key: meshKey(model), shapesKey: shapesKey(model), data: r.mesh, warnings: r.warnings },
        result: { key: solveKey(model), data: r },
      }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [state.model]);

  const exportFiles = useCallback(async () => {
    setBusy('export');
    setError(null);
    try {
      const files = await exportOpenCfs(state.model);
      for (const [name, text] of Object.entries(files)) download(name, text);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [state.model]);

  const prog = useMemo(() => progress(state), [state]);
  return { ...state, progress: prog, busy, error, update, load, runMesh, runSolve, exportFiles };
}

export type FemStudio = ReturnType<typeof useFemStudio>;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
