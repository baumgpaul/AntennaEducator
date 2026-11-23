import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject } from '@/api/projects';
import { femError, meshModel, solveModel, exportOpenCfs, type Issue } from './api';
import { EMPTY_MODEL, type FemModel } from './model';
import { fromSaved, toSaved, type Computed } from './savedResults';
import { meshKey, progress, shapesKey, solveKey, type StudioState } from './studioState';
import { evaluateShapes } from './views/geometryDraw';
import { zipFiles } from './zip';

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

/** Shapes that can be meshed: then the domains and boundaries can be found without asking. */
const canFindDomains = (m: FemModel) => m.shapes.length > 0 && !evaluateShapes(m).error;

/**
 * Model, results and actions of FEM Studio. With a project id the model is
 * the project's design_state, saved automatically, and the computed mesh and
 * solution are saved with it (simulation_results); without one it is a draft
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
  const savedResults = useRef<Computed>({}); // the mesh and result the project holds

  const fail = useCallback((e: unknown) => {
    const { message, issues } = femError(e);
    setError(message);
    setState((s) => ({ ...s, issues }));
  }, []);

  /** Mesh a model ("Find domains & boundaries"); the keys say which inputs the mesh belongs to. */
  const meshFor = useCallback(
    async (model: FemModel) => {
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
    },
    [fail],
  );

  // Load the project with its saved mesh and solution; without a mesh, find the domains
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    loaded.current = false;
    getProject(projectId)
      .then((p) => {
        if (cancelled) return;
        setProject({ name: p.name, fromCourse: !!p.source_project_id, hasDocs: !!p.has_documentation });
        const model = modelFromProject(p.design_state, p.name);
        const computed = fromSaved(p.simulation_results?.femResult);
        savedJson.current = JSON.stringify(model);
        savedResults.current = computed;
        setState({ model, issues: [], ...computed });
        loaded.current = true;
        setSaveStatus('saved');
        if (!computed.mesh && canFindDomains(model)) void meshFor(model);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(femError(e).message);
        setSaveStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, meshFor]);

  // A draft restored in this browser: find its domains once
  const draftMeshed = useRef(false);
  useEffect(() => {
    if (projectId || draftMeshed.current) return;
    draftMeshed.current = true;
    // starts the mesh request (an external system); only its busy flag is set right away
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canFindDomains(state.model)) void meshFor(state.model);
    // once, for the draft the page opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      updateProject(projectId, { design_state: { ...state.model } })
        .then(() => {
          savedJson.current = json;
          setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('error'));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.model, projectId]);

  // Save the computed mesh and solution with the project whenever they change
  const { mesh, result } = state;
  useEffect(() => {
    if (!projectId || !loaded.current) return;
    if (mesh === savedResults.current.mesh && result === savedResults.current.result) return;
    savedResults.current = { mesh, result };
    const femResult = toSaved({ mesh, result });
    updateProject(projectId, { simulation_results: femResult ? { femResult } : {} }).catch((e) =>
      // the model itself is saved; only a reload would have to mesh/solve again
      console.warn('FEM results not saved with the project:', femError(e).message),
    );
  }, [mesh, result, projectId]);

  const update = useCallback((change: (m: FemModel) => FemModel) => {
    setState((s) => ({ ...s, model: change(s.model), issues: [] }));
    setError(null);
  }, []);

  /** Start from another model (a template): its domains are found right away. */
  const modelName = state.model.name;
  const load = useCallback(
    (template: FemModel) => {
      const model = { ...structuredClone(template), name: modelName };
      setState({ model, issues: [] });
      setError(null);
      if (canFindDomains(model)) void meshFor(model);
    },
    [modelName, meshFor],
  );

  const runMesh = useCallback(() => meshFor(state.model), [meshFor, state.model]);

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
  }, [state.model, fail]);

  /** The openCFS input files as one zip (mesh, simulation, materials) */
  const exportFiles = useCallback(async () => {
    setBusy('export');
    setError(null);
    try {
      const files = await exportOpenCfs(state.model);
      const base = safeName(state.model.name) || 'fem-model';
      download(`${base}-opencfs.zip`, zipFiles(files));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }, [state.model, fail]);

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

const safeName = (name: string) => name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
