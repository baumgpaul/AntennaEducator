import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject } from '@/api/projects';
import { femError, meshModel, solveModel, exportOpenCfs, type Issue } from './api';
import { EMPTY_MODEL, type FemModel } from './model';
import { meshKey, progress, shapesKey, solveKey, type StudioState } from './studioState';

const STORAGE_KEY = 'fem-studio-model';
const SAVE_DELAY_MS = 1000;

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'error' | 'draft';

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

/** A project's design_state as a model (a new or unknown state starts empty). */
export function modelFromProject(designState: unknown, name: string): FemModel {
  const m = designState as FemModel | undefined;
  return m && m.version === 1 && Array.isArray(m.shapes) ? { ...m, name } : { ...EMPTY_MODEL, name };
}

/**
 * Model, results and actions of FEM Studio. With a project id the model is
 * the project's design_state, saved automatically; without one it is a draft
 * kept in this browser (the /fem scratch page).
 */
export function useFemStudio(projectId?: string) {
  const [state, setState] = useState<StudioState>(() => ({
    model: projectId ? EMPTY_MODEL : loadDraft(),
    issues: [],
  }));
  const [busy, setBusy] = useState<null | 'mesh' | 'solve' | 'export'>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(projectId ? 'loading' : 'draft');
  const [project, setProject] = useState<{ name: string; fromCourse: boolean; hasDocs: boolean } | null>(null);
  const loaded = useRef(!projectId);
  const savedJson = useRef<string | null>(null); // what the project holds: no needless saves

  // Load the project
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    loaded.current = false;
    getProject(projectId)
      .then((p) => {
        if (cancelled) return;
        setProject({ name: p.name, fromCourse: !!p.source_project_id, hasDocs: !!p.has_documentation });
        const model = modelFromProject(p.design_state, p.name);
        savedJson.current = JSON.stringify(model);
        setState({ model, issues: [] });
        loaded.current = true;
        setSaveStatus('saved');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(femError(e).message);
        setSaveStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Save: the project (debounced) or the browser draft
  useEffect(() => {
    if (!loaded.current) return;
    if (!projectId) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.model));
      } catch {
        /* draft only */
      }
      return;
    }
    const json = JSON.stringify(state.model);
    if (json === savedJson.current) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      updateProject(projectId, { design_state: state.model })
        .then(() => {
          savedJson.current = json;
          setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('error'));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.model, projectId]);

  const update = useCallback((change: (m: FemModel) => FemModel) => {
    setState((s) => ({ ...s, model: change(s.model), issues: [] }));
    setError(null);
  }, []);

  const load = useCallback((model: FemModel) => {
    setState((s) => ({ model: { ...structuredClone(model), name: s.model.name }, issues: [] }));
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
  return {
    ...state,
    progress: prog,
    busy,
    error,
    saveStatus,
    project,
    update,
    load,
    runMesh,
    runSolve,
    exportFiles,
  };
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
