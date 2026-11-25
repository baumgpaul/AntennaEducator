import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject, updateProject } from '@/api/projects';
import { femError, meshModel, solveModel, exportOpenCfs, type Issue } from './api';
import { EMPTY_MODEL, upgradeModel, type FemModel } from './model';
import { fromSaved, toSaved, type Computed } from './savedResults';
import { meshKey, progress, shapesKey, solveKey, type StudioState } from './studioState';
import { runSequence } from './geometry/sequence';
import { zipFiles } from './zip';

const STORAGE_KEY = 'fem-studio-model';
const SAVE_DELAY_MS = 1000;
const MERGE_MS = 700; // quick edits (typing) within this make one undo step
const MAX_UNDO = 100;

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'unsaved' | 'error' | 'draft';

function loadDraft(): FemModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const m = upgradeModel(JSON.parse(raw));
      if (m) return m;
    }
  } catch {
    /* private mode, corrupt draft: start empty */
  }
  return EMPTY_MODEL;
}

/** A project's design_state as a model (version 1 is upgraded; a new or unknown state starts empty). */
export function modelFromProject(designState: unknown, name: string): FemModel {
  const m = upgradeModel(designState);
  return m ? { ...m, name } : { ...EMPTY_MODEL, name };
}

/** A geometry that can be meshed: then the domains and boundaries can be found without asking. */
const canFindDomains = (m: FemModel) => m.steps.length > 0 && runSequence(m).errors.length === 0;

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
        if (computed.mesh?.shapesKey !== shapesKey(model) && canFindDomains(model)) void meshFor(model);
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

  // Undo/redo of model edits. Edits of one gesture (a drag), or quick edits
  // without a gesture (typing), make one step.
  const modelRef = useRef(state.model);
  useEffect(() => {
    modelRef.current = state.model;
  }, [state.model]);
  const history = useRef<{ past: FemModel[]; future: FemModel[]; last: { at: number; gesture?: string } }>({
    past: [],
    future: [],
    last: { at: 0 },
  });
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const show = useCallback((model: FemModel) => {
    modelRef.current = model;
    setState((s) => ({ ...s, model, issues: [] }));
    setError(null);
    setSteps({ undo: history.current.past.length, redo: history.current.future.length });
  }, []);

  const update = useCallback(
    (change: (m: FemModel) => FemModel, options?: { gesture?: string }) => {
      const prev = modelRef.current;
      const next = change(prev);
      if (next === prev) return;
      const h = history.current;
      const now = Date.now();
      const gesture = options?.gesture;
      const merge = gesture ? h.last.gesture === gesture : !h.last.gesture && now - h.last.at < MERGE_MS;
      if (!merge) h.past = [...h.past.slice(-(MAX_UNDO - 1)), prev];
      h.future = [];
      h.last = { at: now, gesture };
      show(next);
    },
    [show],
  );
  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.at(-1);
    if (!prev) return;
    h.past = h.past.slice(0, -1);
    h.future = [...h.future, modelRef.current];
    h.last = { at: 0 };
    show(prev);
  }, [show]);
  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.at(-1);
    if (!next) return;
    h.future = h.future.slice(0, -1);
    h.past = [...h.past, modelRef.current];
    h.last = { at: 0 };
    show(next);
  }, [show]);

  /** Start from another model (a template): its domains are found right away. */
  const modelName = state.model.name;
  const load = useCallback(
    (template: FemModel) => {
      const model = { ...structuredClone(template), name: modelName };
      update(() => model, { gesture: `load-${Date.now()}` }); // undoable
      setState({ model, issues: [] }); // results of the old model go
      if (canFindDomains(model)) void meshFor(model);
    },
    [modelName, meshFor, update],
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
    undo,
    redo,
    canUndo: steps.undo > 0,
    canRedo: steps.redo > 0,
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
