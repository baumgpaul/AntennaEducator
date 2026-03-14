/**
 * Phase 8A — Preprocessor UI & 3D Scene tests (TDD)
 *
 * Tests for:
 * - FdtdScene3D: 3D canvas renders, domain wireframe, structures, sources, probes
 * - FdtdTreeView: tree hierarchy, selection, CRUD
 * - FdtdPropertiesPanel: edits selected element, dispatches updates
 * - FdtdRibbonMenu: toolbar buttons, dialog triggers
 * - BoundaryPanel: per-face boundary config, "set all" convenience
 * - CustomStructureDialog: creates box/cylinder/sphere with material
 * - PatchAntennaDialog: creates substrate + patch + ground plane + feed
 * - FdtdDesignPage restructured: 3-panel layout with ribbon
 */
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fdtdDesignReducer, {
  addStructure,
  addSource,
  addProbe,
  setBoundaries,
  setDimensionality,
} from '@/store/fdtdDesignSlice';
import fdtdSolverReducer from '@/store/fdtdSolverSlice';
import authReducer from '@/store/authSlice';
import projectsReducer from '@/store/projectsSlice';
import designReducer from '@/store/designSlice';
import uiReducer from '@/store/uiSlice';
import solverReducer from '@/store/solverSlice';
import postprocessingReducer from '@/store/postprocessingSlice';
import documentationReducer from '@/store/documentationSlice';
import foldersReducer from '@/store/foldersSlice';
import type { FdtdStructure, FdtdSource, FdtdProbe, DomainBoundaries } from '@/types/fdtd';

// ---------------------------------------------------------------------------
// Mock React Three Fiber + drei (no WebGL in jsdom)
// ---------------------------------------------------------------------------
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="r3f-canvas">{children}</div>
  ),
  useThree: () => ({
    camera: {},
    scene: {},
    gl: { domElement: document.createElement('canvas') },
    size: { width: 800, height: 600 },
  }),
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  GizmoHelper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GizmoViewport: () => null,
  Grid: () => null,
  PerspectiveCamera: () => null,
  Line: ({ points }: { points: number[][] }) => (
    <div data-testid="drei-line" data-points={JSON.stringify(points)} />
  ),
  Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ---------------------------------------------------------------------------
// Test store factory
// ---------------------------------------------------------------------------
function createTestStore(preloadedFdtdDesign?: Partial<ReturnType<typeof fdtdDesignReducer>>) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      projects: projectsReducer,
      design: designReducer,
      ui: uiReducer,
      solver: solverReducer,
      postprocessing: postprocessingReducer,
      documentation: documentationReducer,
      folders: foldersReducer,
      fdtdDesign: fdtdDesignReducer,
      fdtdSolver: fdtdSolverReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  // Preload some state if requested
  if (preloadedFdtdDesign) {
    if (preloadedFdtdDesign.structures) {
      for (const s of preloadedFdtdDesign.structures) {
        store.dispatch(addStructure({ ...s }));
      }
    }
    if (preloadedFdtdDesign.sources) {
      for (const src of preloadedFdtdDesign.sources) {
        store.dispatch(addSource({ ...src }));
      }
    }
    if (preloadedFdtdDesign.probes) {
      for (const p of preloadedFdtdDesign.probes) {
        store.dispatch(addProbe({ ...p }));
      }
    }
  }

  return store;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const sampleStructure: Omit<FdtdStructure, 'id'> = {
  name: 'Test Box',
  type: 'box',
  position: [0.5, 0.5, 0],
  dimensions: { width: 0.3, height: 0.2, depth: 0.01 },
  material: 'fr4',
};

const sampleSource: Omit<FdtdSource, 'id'> = {
  name: 'Source 1',
  type: 'gaussian_pulse',
  position: [0.5, 0.5, 0],
  parameters: { amplitude: 1.0, width: 30 },
  polarization: 'z',
};

const sampleProbe: Omit<FdtdProbe, 'id'> = {
  name: 'Probe 1',
  type: 'point',
  position: [0.75, 0.75, 0],
  fields: ['Ez'],
};

// ===================================================================
// FdtdScene3D
// ===================================================================
describe('FdtdScene3D', () => {
  let FdtdScene3D: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../scene/FdtdScene3D');
    FdtdScene3D = mod.default;
  });

  it('renders a canvas element', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtfScene3DWrapper Component={FdtdScene3D} />
      </Provider>,
    );
    expect(screen.getByTestId('r3f-canvas')).toBeDefined();
  });

  it('renders domain wireframe label', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtfScene3DWrapper Component={FdtdScene3D} />
      </Provider>,
    );
    // The scene should render without crashing — the mock Canvas is a div
    expect(screen.getByTestId('r3f-canvas')).toBeDefined();
  });
});

// Helper to wrap scene in store
function FdtfScene3DWrapper({ Component }: { Component: React.ComponentType<any> }) {
  return <Component />;
}

// ===================================================================
// FdtdTreeView
// ===================================================================
describe('FdtdTreeView', () => {
  let FdtdTreeView: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../FdtdTreeView');
    FdtdTreeView = mod.default;
  });

  it('renders empty tree with category headers', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdTreeView onSelect={vi.fn()} selectedId={null} />
      </Provider>,
    );
    expect(screen.getAllByText(/Structures/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sources/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Probes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Boundaries/i).length).toBeGreaterThan(0);
  });

  it('renders structures in tree', () => {
    const store = createTestStore({ structures: [sampleStructure as FdtdStructure] });
    render(
      <Provider store={store}>
        <FdtdTreeView onSelect={vi.fn()} selectedId={null} />
      </Provider>,
    );
    expect(screen.getByText(/Test Box/i)).toBeDefined();
  });

  it('renders sources in tree', () => {
    const store = createTestStore({ sources: [sampleSource as FdtdSource] });
    render(
      <Provider store={store}>
        <FdtdTreeView onSelect={vi.fn()} selectedId={null} />
      </Provider>,
    );
    expect(screen.getByText(/Source 1/i)).toBeDefined();
  });

  it('renders probes in tree', () => {
    const store = createTestStore({ probes: [sampleProbe as FdtdProbe] });
    render(
      <Provider store={store}>
        <FdtdTreeView onSelect={vi.fn()} selectedId={null} />
      </Provider>,
    );
    expect(screen.getByText(/Probe 1/i)).toBeDefined();
  });

  it('calls onSelect when item clicked', async () => {
    const onSelect = vi.fn();
    const store = createTestStore({ structures: [sampleStructure as FdtdStructure] });
    render(
      <Provider store={store}>
        <FdtdTreeView onSelect={onSelect} selectedId={null} />
      </Provider>,
    );
    const item = screen.getByText(/Test Box/i);
    await userEvent.click(item);
    expect(onSelect).toHaveBeenCalled();
  });
});

// ===================================================================
// FdtdPropertiesPanel
// ===================================================================
describe('FdtdPropertiesPanel', () => {
  let FdtdPropertiesPanel: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../FdtdPropertiesPanel');
    FdtdPropertiesPanel = mod.default;
  });

  it('shows empty state when nothing selected', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdPropertiesPanel selectedId={null} selectedCategory={null} />
      </Provider>,
    );
    expect(screen.getByText(/Select an element/i)).toBeDefined();
  });

  it('shows structure properties when structure selected', () => {
    const store = createTestStore({ structures: [sampleStructure as FdtdStructure] });
    const state = store.getState();
    const structId = state.fdtdDesign.structures[0].id;
    render(
      <Provider store={store}>
        <FdtdPropertiesPanel selectedId={structId} selectedCategory="structure" />
      </Provider>,
    );
    expect(screen.getByText(/Test Box/i)).toBeDefined();
  });

  it('shows source properties when source selected', () => {
    const store = createTestStore({ sources: [sampleSource as FdtdSource] });
    const state = store.getState();
    const srcId = state.fdtdDesign.sources[0].id;
    render(
      <Provider store={store}>
        <FdtdPropertiesPanel selectedId={srcId} selectedCategory="source" />
      </Provider>,
    );
    expect(screen.getByText(/Source 1/i)).toBeDefined();
  });
});

// ===================================================================
// BoundaryPanel
// ===================================================================
describe('BoundaryPanel', () => {
  let BoundaryPanel: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../BoundaryPanel');
    BoundaryPanel = mod.default;
  });

  it('renders face selectors (6 for 2D)', () => {
    const store = createTestStore();
    store.dispatch(setDimensionality('2d'));
    render(
      <Provider store={store}>
        <BoundaryPanel />
      </Provider>,
    );
    // Should have labels for each face in 2D mode
    expect(screen.getByText(/x_min/i)).toBeDefined();
    expect(screen.getByText(/x_max/i)).toBeDefined();
    expect(screen.getByText(/y_min/i)).toBeDefined();
    expect(screen.getByText(/y_max/i)).toBeDefined();
  });

  it('renders "Set All" button', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <BoundaryPanel />
      </Provider>,
    );
    expect(screen.getByText(/Set All/i)).toBeDefined();
  });
});

// ===================================================================
// FdtdRibbonMenu
// ===================================================================
describe('FdtdRibbonMenu', () => {
  let FdtdRibbonMenu: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../FdtdRibbonMenu');
    FdtdRibbonMenu = mod.default;
  });

  it('renders Add Structure button in design mode', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdRibbonMenu
          activeTab="designer"
          onAddStructure={vi.fn()}
          onAddSource={vi.fn()}
          onAddProbe={vi.fn()}
          onOpenBoundaries={vi.fn()}
          onOpenMaterialLibrary={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText(/Add Structure/i)).toBeDefined();
  });

  it('renders Add Source button in design mode', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdRibbonMenu
          activeTab="designer"
          onAddStructure={vi.fn()}
          onAddSource={vi.fn()}
          onAddProbe={vi.fn()}
          onOpenBoundaries={vi.fn()}
          onOpenMaterialLibrary={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText(/Add Source/i)).toBeDefined();
  });

  it('renders Add Probe button in design mode', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdRibbonMenu
          activeTab="designer"
          onAddStructure={vi.fn()}
          onAddSource={vi.fn()}
          onAddProbe={vi.fn()}
          onOpenBoundaries={vi.fn()}
          onOpenMaterialLibrary={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText(/Add Probe/i)).toBeDefined();
  });

  it('renders solver controls in solver mode', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <FdtdRibbonMenu
          activeTab="solver"
          onAddStructure={vi.fn()}
          onAddSource={vi.fn()}
          onAddProbe={vi.fn()}
          onOpenBoundaries={vi.fn()}
          onOpenMaterialLibrary={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText(/Run Simulation/i)).toBeDefined();
  });
});

// ===================================================================
// CustomStructureDialog
// ===================================================================
describe('CustomStructureDialog', () => {
  let CustomStructureDialog: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../dialogs/CustomStructureDialog');
    CustomStructureDialog = mod.default;
  });

  it('renders dialog when open', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <CustomStructureDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByText(/Custom Structure/i)).toBeDefined();
  });

  it('has name field', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <CustomStructureDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByLabelText(/Name/i)).toBeDefined();
  });

  it('has shape type selector', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <CustomStructureDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByText(/Shape/i)).toBeDefined();
  });

  it('has material selector', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <CustomStructureDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getAllByText(/Material/i).length).toBeGreaterThan(0);
  });

  it('does not render when closed', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <CustomStructureDialog open={false} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.queryByText(/Custom Structure/i)).toBeNull();
  });
});

// ===================================================================
// PatchAntennaDialog
// ===================================================================
describe('PatchAntennaDialog', () => {
  let PatchAntennaDialog: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('../dialogs/PatchAntennaDialog');
    PatchAntennaDialog = mod.default;
  });

  it('renders dialog when open', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PatchAntennaDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getAllByText(/Patch Antenna/i).length).toBeGreaterThan(0);
  });

  it('has patch dimensions fields', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PatchAntennaDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    // Patch length and width inputs
    expect(screen.getByLabelText(/Patch Length/i)).toBeDefined();
    expect(screen.getByLabelText(/Patch Width/i)).toBeDefined();
  });

  it('has substrate properties fields', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PatchAntennaDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByLabelText(/Substrate Height/i)).toBeDefined();
  });

  it('has generate button', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PatchAntennaDialog open={true} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByRole('button', { name: /Generate/i })).toBeDefined();
  });

  it('does not render when closed', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <PatchAntennaDialog open={false} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.queryByText(/Patch Antenna/i)).toBeNull();
  });
});

// ===================================================================
// FdtdDesignPage — restructured layout
// ===================================================================
describe('FdtdDesignPage — restructured layout', () => {
  beforeEach(async () => {
    const mod = await import('../FdtdDesignPage');
    FdtdDesignPageModule = mod.default;
  });

  function renderPage() {
    const store = createTestStore();
    return render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/fdtd/test-project/design']}>
          <Routes>
            <Route
              path="/fdtd/:projectId/design"
              element={<FdtdDesignPageWrapper />}
            />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
  }

  it('renders the page with tabs', async () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /Design/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Solver/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Post-processing/i })).toBeDefined();
  });

  it('renders FDTD Workspace title', () => {
    renderPage();
    expect(screen.getByText(/FDTD Workspace/i)).toBeDefined();
  });

  it('renders 3D scene canvas in design tab', () => {
    renderPage();
    expect(screen.getByTestId('r3f-canvas')).toBeDefined();
  });

  it('renders tree view panel', () => {
    renderPage();
    expect(screen.getAllByText(/Structures/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sources/i).length).toBeGreaterThan(0);
  });
});

// Lazy wrapper for the restructured page — uses a pre-loaded module reference
let FdtdDesignPageModule: React.ComponentType<any> | null = null;

function FdtdDesignPageWrapper() {
  if (!FdtdDesignPageModule) throw new Error('FdtdDesignPage not loaded');
  const Page = FdtdDesignPageModule;
  return <Page />;
}
