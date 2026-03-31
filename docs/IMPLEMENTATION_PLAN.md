# Antenna Educator — Implementation Plan

> Created: 2026-03-26 | Target: Production-ready educational EM simulation platform

---

## Table of Contents

1. [Phase 0 — Bug Fixes & Stabilization](#phase-0--bug-fixes--stabilization)
2. [Phase 1 — Variable & Parameter Management](#phase-1--variable--parameter-management)
3. [Phase 2 — Custom Antenna Geometry (CSV Import + Visual Editor)](#phase-2--custom-antenna-geometry-csv-import--visual-editor)
4. [Phase 3 — Lumped Element & Port System](#phase-3--lumped-element--port-system)
5. [Phase 4 — Solver Enhancements (Port Quantities, S11, VSWR)](#phase-4--solver-enhancements-port-quantities-s11-vswr)
6. [Phase 5 — Generalized Line Plotting + Smith Chart](#phase-5--generalized-line-plotting--smith-chart)
7. [Phase 6 — Course Submission System](#phase-6--course-submission-system)
8. [Phase 7 — Structured PDF Export](#phase-7--structured-pdf-export)
9. [Phase 8 — Refactoring & Hardening](#phase-8--refactoring--hardening)
10. [Phase 9 — Deployment Rework](#phase-9--deployment-rework)
11. [Dependency Graph](#dependency-graph)

---

## Phase 0 — Bug Fixes & Stabilization ✅ COMPLETE

**Goal**: Fix all known issues in the existing 4 antenna types (dipole, loop, rod, helix), the design dialogs, solver integration, and postprocessing pipeline before building on top.

**Rationale**: Starting here first because every subsequent phase depends on a working baseline. Bugs compound if left unfixed.

### 0.1 — Audit & Fix Antenna Builder Issues

**Backend** (`backend/preprocessor/builders.py`, `schemas.py`):

- [x] **Dipole**: Verify balanced gap feed — ensure both source polarities are correctly signed for differential excitation. Write a unit test that checks the two source amplitudes sum to zero (balanced). *(35 tests in `test_builders_edge_cases.py`)*
- [x] **Loop**: Test wraparound edge (edge from last node back to first) — verify it carries correct radius and is included in `edge_to_element` mapping. Test with odd and even segment counts. *(7 tests: even/odd segments, gapped no-wraparound, VS/CS wire removal)*
- [x] **Rod**: Verify ground node (index 0) is correctly referenced in the incidence matrix. Test that a rod with N segments produces N+1 nodes where node 1 is at the base (ground). *(5 tests: N+1 nodes, ground ref, base/tip position, consecutive edges)*
- [x] **Helix**: ~~Verify pitch/turn geometry for edge cases.~~ *Removed — helix antenna type fully removed in Phase 1 (frontend + backend).*
- [x] **All builders**: Add validation tests for `lumped_elements` with `node_start`/`node_end` at boundary nodes (first, last, ground). Make sure out-of-range node indices raise clear errors. *(7 tests: ground/last/boundary valid, out-of-range raises ValueError)*
- [x] **All builders**: Verify that `source_edges` in the returned `Mesh` correctly maps to the edges where sources are placed. This is critical for solver feeding. *(4 tests: source_edges field existence + population)*

**Frontend dialogs**:

- [~] **DipoleDialog**: ~~Test orientation presets (X/Y/Z), gap toggle.~~ *Deferred to Phase 3 dialog rework.*
- [~] **LoopDialog**: ~~Verify `normal_vector` normalization, gap position mapping.~~ *Deferred to Phase 3 dialog rework.*
- [~] **RodDialog**: ~~Verify `base_position` defaults, normalized orientation.~~ *Deferred to Phase 3 dialog rework.*
- [x] **HelixDialog**: ~~Check `segments_per_turn` minimum.~~ *Removed — helix fully removed in Phase 1.*
- [x] **SourceDialog**: Fix node index input — ensure it validates against the actual element's node count (not hardcoded max). *(Dynamic Zod schema `createSourceSchema(maxNodeIndex)` with `.refine()` validators)*
- [x] **LumpedElementDialog**: Same node validation issue. Also verify `C_inv` conversion (user enters C in Farads, backend expects 1/C). *(Dynamic Zod schema + changed field from "Inverse Capacitance (1/F)" to "Capacitance (F)" with auto C→1/C conversion)*
- [x] **All dialogs**: Fix hooks ordering violations flagged in `.eslintrc.cjs` (hooks called after early returns in renderer components). *(Audit confirmed: no hooks ordering violations found — all dialogs clean)*

**Solver integration**:

- [x] **Field computation not wired** (`SolutionDataPanel.tsx`): Replaced simulated `setTimeout` with `dispatch(computePostprocessingWorkflow())`. Replaced mock `Math.random()` voltage table with real `node_voltages` from solver results. Added `LinearProgress` for postprocessing progress.
- [x] **JWT expiration** (`frontend/src/api/auth.ts`): Implemented `isTokenExpired()` — decodes JWT payload (base64), extracts `exp` claim, compares with `Date.now()/1000` (30s grace for clock skew).
- [~] **Scalar plot data pipeline**: ~~LineViewPanel / ImpedancePlot / CurrentPlot / VoltagePlot wiring.~~ *Deferred to Phase 5 (unified plot system).*

**Tests**:

- [x] Fix hanging vitest issue in CI — made vitest blocking in `buildspec-test.yml` (removed `|| echo` fallback). Known `document is not defined` failures in some tests are a pre-existing jsdom issue.
- [x] Run `pytest tests/unit/` — all 601 tests pass (including gold-standard half-wave dipole). No failures.
- [~] ~~Add missing integration tests for loop, rod, helix → solver → postprocessor pipeline.~~ *Deferred — integration tests will run against deployed solution, not local.*

### 0.2 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `tests/unit/test_builders_edge_cases.py` | Test | ✅ Done | 35 edge-case tests for dipole, loop, rod builders |
| `tests/unit/test_solver_lumped.py` | Test | ⏳ Deferred | Solver with lumped elements on boundary nodes (covered partially by builder tests) |
| SourceDialog + LumpedElementDialog fixes | Frontend | ✅ Done | Dynamic Zod node validation, capacitance UX (C→1/C) |
| SolutionDataPanel wiring | Frontend | ✅ Done | Real postprocessor dispatch, real voltage data, progress bar |
| JWT expiration | Frontend | ✅ Done | Decode JWT payload, check `exp` claim |
| vitest CI blocking | CI | ✅ Done | Removed non-blocking fallback in `buildspec-test.yml` |
| `LineViewPanel.tsx` wiring | Frontend | ⏳ Phase 5 | Deferred to unified plot system |

---

## Phase 1 — Variable & Parameter Management ✅ COMPLETE

**Goal**: Introduce named variables and expressions so antenna parameters can reference symbolic values. This is foundational for future sweeps and optimization, and makes the custom geometry designer far more useful.

**Rationale**: Doing this before the custom geometry phase means the CSV import and visual editor can reference variables from the start (e.g., `arm_length = lambda/4`). It also enables parameterized element definitions in the existing 4 types.

**Status**: Implemented in PR #57 on branch `phase1/variable-parameter-management`. All CI checks pass (738 backend tests, 824+ frontend tests, tsc, ESLint, black, isort, ruff).

**Additional work completed beyond original scope** (PR #57, second batch):
- **Helix antenna removed**: Entire helix type removed from backend (endpoint, builders, schemas ~500 lines) and frontend (dialog, thunk, API, menu, tests). `HelixConfig` kept as `@deprecated` for old project compatibility.
- **Expression fields expanded to ALL meaningful parameters**: DipoleDialog (12 fields: length, radius, gap, segments, amplitude, phase, position x/y/z, orientation x/y/z), LoopDialog (12 fields: radius, wireRadius, feedGap, segments, amplitude, phase, position x/y/z, orientation rotX/rotY/rotZ), RodDialog (8 fields: start x/y/z, end x/y/z, radius, segments). Segments auto-rounded to integer. Orientation/start-end validation moved to submit handler.
- **Resizable panels**: Left panel (200-500px, default 280) and right panel (250-500px, default 320) resizable via drag handles with localStorage persistence.
- **Sidebar reorder**: Variables panel now above Structure panel; Structure panel is collapsible.
- **69 new expression tests**: DipoleDialog.expressions (21), LoopDialog.expressions (19), RodDialog.expressions (10), variableRemesh expanded (12), PropertiesPanel.expressions expanded (7).

### 1.0 — Design Decisions Made

These decisions were made during implementation and should guide future phases:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Variable Panel location** | Left sidebar, collapsible accordion inside `TreeViewPanel` | Consistent with existing Structure panel pattern; always visible without extra navigation |
| **Dialog integration** | All 3 dialogs (Dipole, Loop, Rod) — Helix removed | Full coverage; same `ExpressionField` component everywhere. Helix removed entirely (frontend + backend) for simplicity. |
| **ALL fields expression-capable** | Every numeric field in every dialog accepts expressions | Position, orientation, amplitude, phase, segments — not just geometry params. Segments auto-rounded to integer. |
| **Resizable panels** | Left + right panels draggable with localStorage persistence | 4px resize handles, min/max bounds, smooth drag via document mousemove |
| **Sidebar order** | Variables above Structure; Structure collapsible | Variables most-used panel, always visible first |
| **Variable reordering** | Insertion order only (no drag-and-drop) | Simpler UX; variables evaluate top-down so order matters but rarely changes |
| **design_state version** | Bumped to version 3 (v2 had elements only) | Projects without variables auto-reset to defaults on load |
| **Built-in constants** | Read-only rows in VariablePanel: `C_0`, `MU_0`, `EPSILON_0`, `Z_0`, `pi` | Always available, not editable; shown in a separate section above user variables |
| **Expression field UX** | Single unified field accepting both plain numbers and expressions (no toggle) | Fewer clicks; a plain number like `0.5` is just a trivial expression |
| **Resolved value display** | Helper text below each expression field | Non-intrusive; updates live as user types |
| **Default frequency variable** | `freq = 300e6 Hz` + `wavelength = C_0 / freq` | Enables `wavelength / 2` style expressions immediately; solver sweep still overrides at solve time |
| **Variable editing** | Inline in table rows (not a separate dialog) | Faster workflow; direct manipulation in the panel |
| **Expression persistence on elements** | `expressions?: Record<string, string>` on `AntennaElement` (field name → raw expression string) | Enables re-evaluation when variables change; stored alongside config which has resolved numeric values |
| **PropertiesPanel display** | Expression shown in monospace primary-color text below resolved value (e.g., `= wavelength / 2`) | Clear visual distinction; only shown when expression differs from plain number |
| **Auto-remesh on variable change** | Full re-mesh via preprocessor API (not just config number update) | Ensures mesh integrity — node/edge counts may change with parameter changes |
| **Frontend expression parser** | Hand-written recursive-descent parser in TypeScript | No safe AST mode in JS like Python; no external dependency; same grammar as backend |
| **Backend expression evaluator** | Python `ast` module with whitelisted node types — **no `eval()`** | Security-first; only safe math operations allowed |
| **Circular dependency detection** | DFS with 3-color marking (white/gray/black) | Standard algorithm; detects and reports the cycle path in error messages |
| **Column headers in VariablePanel** | Name, Expression, Value, Unit | Clear tabular layout matching the data model fields |

### 1.1 — Backend: Variable Store & Expression Engine ✅

**Files created**:
- `backend/common/models/variables.py` — `Variable` + `VariableContext` Pydantic models (160 lines)
- `backend/common/utils/expressions.py` — Safe AST-based expression evaluator (270 lines)

**Expression evaluator** (`expressions.py`):
- Safe math parser using Python `ast` module — only allows: numbers, arithmetic (`+`, `-`, `*`, `/`, `**`, `//`, `%`), unary ops, math functions (`sin`, `cos`, `tan`, `sqrt`, `log`, `log10`, `exp`, `abs`, `ceil`, `floor`, `round`, `min`, `max`, `atan2`), and variable references.
- **No `eval()`** — whitelist AST node types to prevent code injection.
- Built-in constants: `C_0`, `MU_0`, `EPSILON_0`, `Z_0`, `pi`, `e`, `inf` (from `backend/common/constants.py`).
- Variables resolve top-down (variable N can reference variables 1..N-1).
- Circular dependency detection via DFS with 3-color marking.
- Error messages name the failing variable and expression.
- `parse_numeric_or_expression(value, variables)` — unified parser for schema fields (accepts `float | str`).

**Integration with preprocessor**:
- Each antenna request schema gets an optional `variable_context: list[VariableDefinition]` field.
- `@model_validator(mode='before')` intercepts raw data, evaluates variable context, resolves string-valued numeric fields to floats BEFORE Pydantic's `Field(gt=0)` validators run.
- `_resolve_expressions()` helper handles resolution for specified numeric field names per antenna type.

**Tests**: 141 backend tests (79 in `test_expressions.py`, 62 in `test_variables.py`)

### 1.2 — Frontend: Variable Panel ✅

**Files created**:
- `frontend/src/features/design/VariablePanel.tsx` — Collapsible sidebar panel (240+ lines)
- `frontend/src/store/variablesSlice.ts` — Redux state for variables (102 lines)
- `frontend/src/utils/expressionEvaluator.ts` — TypeScript recursive-descent parser (490+ lines)
- `frontend/src/components/ExpressionField.tsx` — Reusable expression-aware TextField (151 lines)

**UI**:
- Collapsible accordion in `TreeViewPanel` (left sidebar), between "Structure" and "Solver" sections.
- Table with column headers: **Name | Expression | Value | Unit**.
- Inline editing — user types name and expression, value updates live.
- Add/remove rows. No drag-and-drop (insertion order only).
- Validation: red highlight if expression fails to parse or has circular dependency; error tooltip on hover.
- Built-in constants shown as read-only rows in a separate "Constants" section: `C_0`, `MU_0`, `EPSILON_0`, `Z_0`, `pi`.
- Default variables on new project: `freq = 300e6 Hz`, `wavelength = C_0 / freq m`.

**Integration with antenna dialogs** (all 3 — helix removed):
- ALL numeric input fields use `ExpressionField` component — a single text input accepting both plain numbers and expressions.
- Covers geometry params, segments, source amplitude/phase, position x/y/z, orientation x/y/z (dipole/loop), start/end coordinates (rod).
- Segments auto-rounded to integer via `Math.round()` after expression resolution.
- Orientation non-zero validation (dipole) and start≠end validation (rod) moved to submit handler (post-resolution).
- Resolved value shown as helper text below the expression field. Red helper text on error.
- On submit: expressions are resolved to numbers via `parseNumericOrExpression()`, and raw expression strings are stored in `expressions` dict on the resolved data.
- Pattern per dialog: Zod schema uses `z.string()` for expression-capable fields; `ResolvedXxxData` interface has numeric fields + `expressions?: Record<string, string>`.

**Expression persistence on elements**:
- `AntennaElement.expressions` is an optional `Record<string, string>` mapping field names to expression strings.
- All 4 generate thunks in `designSlice` pass `expressions` from formData to the created element.
- `PropertiesPanel` shows stored expression strings below resolved numeric values in monospace primary-color text.

**Auto-remesh on variable change**:
- `DesignPage` has a `useEffect` watching `variables` state.
- When variables change, iterates all elements with stored expressions.
- Re-evaluates expressions with new variable context, compares with current config values.
- If values changed, dispatches `remeshElementExpressions` thunk which calls the preprocessor API with updated parameters.
- Expression-to-config key mapping handles type-specific field name differences (e.g., dialog's `radius` → config's `wire_radius` for dipole).

**Tests**: 91 frontend tests (69 expression evaluator + 22 expression persistence/remesh/display)

### 1.3 — Persistence ✅

- `variable_context` stored inside `design_state` JSON blob:
  ```json
  {
    "version": 3,
    "elements": [...],
    "variables": [
      {"name": "freq", "expression": "300e6", "unit": "Hz", "description": "Frequency"},
      {"name": "wavelength", "expression": "C_0 / freq", "unit": "m", "description": "Wavelength"}
    ]
  }
  ```
- Auto-save triggers on variable changes (1.5s debounce, same as other auto-save triggers).
- Loading a v2 project (no variables) resets to default variables (`freq`, `wavelength`).
- `expressions` dict on each `AntennaElement` is persisted in `design_state.elements[].expressions`.

### 1.4 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `backend/common/models/variables.py` | Model | ✅ Done | Variable + VariableContext Pydantic models |
| `backend/common/utils/expressions.py` | Utility | ✅ Done | Safe AST-based expression evaluator (270 lines) |
| `tests/unit/test_expressions.py` | Test | ✅ Done | 79 tests: parsing, evaluation, functions, errors |
| `tests/unit/test_variables.py` | Test | ✅ Done | 62 tests: variable context, circular detection, dependencies |
| `frontend/src/store/variablesSlice.ts` | Redux | ✅ Done | Variable state management, selectors |
| `frontend/src/utils/expressionEvaluator.ts` | Utility | ✅ Done | TypeScript recursive-descent parser (490+ lines) |
| `frontend/src/utils/__tests__/expressionEvaluator.test.ts` | Test | ✅ Done | 69 frontend expression evaluator tests |
| `frontend/src/components/ExpressionField.tsx` | Component | ✅ Done | Reusable expression-aware TextField |
| `frontend/src/features/design/VariablePanel.tsx` | Component | ✅ Done | Collapsible panel with column headers |
| Updated antenna dialogs (all 3) | Frontend | ✅ Done | ExpressionField for ALL numeric fields in Dipole/Loop/Rod |
| Helix removal (backend + frontend) | Both | ✅ Done | Builders, endpoint, dialog, thunks, tests removed (~1700 lines) |
| Resizable panels | Frontend | ✅ Done | Left/right panels draggable, localStorage persistence |
| Sidebar reorder | Frontend | ✅ Done | Variables above Structure, Structure collapsible |
| `frontend/src/store/designSlice.ts` updates | Redux | ✅ Done | `remeshElementExpressions` thunk, expressions stored on elements |
| `frontend/src/features/design/PropertiesPanel.tsx` updates | Component | ✅ Done | Expression display with `GeometryRow` helper |
| `frontend/src/features/design/DesignPage.tsx` updates | Component | ✅ Done | v3 save/load, auto-remesh on variable change |
| Schema migration to version 3 | Backend+Frontend | ✅ Done | `variables` array + `expressions` dict in design_state |
| `frontend/src/store/__tests__/designSlice.expressions.test.ts` | Test | ✅ Done | 6 expression persistence tests |
| `frontend/src/store/__tests__/variableRemesh.test.ts` | Test | ✅ Done | 12 variable-change remesh detection tests (expanded with segments + rod coords) |
| `frontend/src/features/design/__tests__/PropertiesPanel.expressions.test.tsx` | Test | ✅ Done | 7 expression display + mapping tests (expanded) |
| `frontend/src/features/design/__tests__/DipoleDialog.expressions.test.tsx` | Test | ✅ Done | 21 expression field tests for DipoleDialog |
| `frontend/src/features/design/__tests__/LoopDialog.expressions.test.tsx` | Test | ✅ Done | 19 expression field tests for LoopDialog |
| `frontend/src/features/design/__tests__/RodDialog.expressions.test.tsx` | Test | ✅ Done | 10 expression field tests for RodDialog |
| `.github/copilot-instructions.md` update | Config | ✅ Done | Added `npx vitest run` to pre-commit checks |

### 1.5 — Known Limitations & Future Improvements

- **No drag-and-drop reordering**: Variables are insertion-ordered. If a user needs to reorder, they must delete and re-add. Could add later if needed.
- **No spreadsheet paste**: Copy-paste from spreadsheet (tab-separated) was planned but deferred. Add if users request it.
- **No variable autocomplete**: Expression fields don't autocomplete variable names (just free-text). Could add a suggestion dropdown later.
- **Remesh is sequential**: When variables change and multiple elements need remesh, they're dispatched sequentially. Could batch or parallelize if performance becomes an issue.
- **No undo/redo for variables**: Variable changes trigger auto-save immediately. A proper undo stack would be a Phase 8 enhancement.

---

## Phase 2 — Custom Antenna Geometry (CSV Import + Visual Editor)

**Goal**: Allow users to define arbitrary wire antenna structures by importing CSV point/connection files or using a visual sub-GUI editor, with clear node/edge labeling.

**Rationale**: With variables in place (Phase 1 ✅), coordinate expressions can reference variables. This is the most impactful preprocessor feature — it unlocks any wire antenna geometry the PEEC solver can handle.

**Prerequisites**: Phase 1 complete ✅ — `ExpressionField`, `variablesSlice`, `parseNumericOrExpression()`, and `evaluateVariableContextNumeric()` are all available for use in the custom geometry editor.

### 2.1 — CSV Format Definition

**Points file** (`points.csv`):
```csv
# node_id, x, y, z, radius
1, 0.0, 0.0, 0.0, 0.001
2, 0.0, 0.0, 0.05, 0.001
3, 0.0, 0.0, -0.05, 0.001
4, 0.025, 0.0, 0.0, 0.0005
```

**Connections file** (`connections.csv`):
```csv
# edge_id, node_start, node_end
1, 1, 2
2, 1, 3
3, 1, 4
```

- Node IDs are 1-based positive integers.
- Coordinates in meters.
- `radius` is wire radius per node (interpolated per edge, or per-edge override in connections file).
- Optional per-edge radius column in connections: `edge_id, node_start, node_end, radius`.
- Lines starting with `#` are comments.
- Delimiter: comma (CSV) — also accept tab-separated.

**Combined single-file format** (alternative):
```csv
# NODES
# id, x, y, z, radius
N, 1, 0.0, 0.0, 0.0, 0.001
N, 2, 0.0, 0.0, 0.05, 0.001
# EDGES
# id, start, end [, radius]
E, 1, 1, 2
E, 2, 1, 3
```

### 2.2 — Backend: Custom Builder

**New/modified files**:
- `backend/preprocessor/builders.py` — Add `create_custom()` + `custom_to_mesh()`
- `backend/preprocessor/schemas.py` — Add `CustomRequest`
- `backend/preprocessor/main.py` — Add `POST /api/antenna/custom` endpoint

**CustomRequest schema**:
```python
class CustomNodeInput(BaseModel):
    id: int                             # 1-based
    x: float
    y: float
    z: float
    radius: float = 0.001              # Default 1mm wire radius

class CustomEdgeInput(BaseModel):
    node_start: int                     # References CustomNodeInput.id
    node_end: int
    radius: float | None = None         # Override node radius if provided

class CustomRequest(BaseModel):
    name: str = "Custom Antenna"
    nodes: list[CustomNodeInput]
    edges: list[CustomEdgeInput]
    sources: list[SourceRequest] = []
    lumped_elements: list[LumpedElementRequest] = []
```

**Builder validation**:
- All node IDs must be unique positive integers.
- All edge references must point to existing node IDs.
- No duplicate edges (same start+end or end+start).
- Graph must be connected (single connected component) — warn but don't block if disconnected.
- At least 1 edge required.
- Node coordinates must be finite (no NaN/Inf).

**Mesh construction**: Direct mapping — nodes → `mesh.nodes`, edges → `mesh.edges`. No interpolation or subdivision (user controls resolution). Re-index to 1-based contiguous if IDs have gaps.

### 2.3 — Frontend: CSV Import

**New files**:
- `frontend/src/features/design/CustomAntennaDialog.tsx` — Main dialog
- `frontend/src/utils/csvParser.ts` — CSV parsing utility

**Dialog flow**:
1. User clicks "Custom" in ribbon menu → opens `CustomAntennaDialog`.
2. **Tab 1: Import** — File upload (drag & drop) for CSV. Accepts single combined file or two separate files (points + connections). Parse and validate immediately. Show error messages inline.
3. **Tab 2: Manual Editor** — Table view with editable rows for nodes and edges. Add/remove rows. Node ID auto-incremented.
4. **Tab 3: Preview** — 3D wireframe of the imported/edited geometry with:
   - Node labels (IDs) rendered at each node position.
   - Edge labels (indices) at edge midpoints.
   - Color-coded: regular nodes (blue), ground node 0 (green), source edges (red), lumped element edges (orange).
   - Interactive orbit/zoom (reuse existing Three.js scene tech).
5. **Source/Lumped tab**: Add sources and lumped elements referencing node IDs from the preview. Node picker — click a node in 3D to select.
6. "Create" button → sends `CustomRequest` to backend → receives `GeometryResponse`.

**Variable integration**: Coordinate fields in the manual editor accept expressions from Phase 1's variable context.

### 2.4 — Frontend: Geometry Sub-GUI for Existing Types

For the 3 existing types (dipole, loop, rod), add a **read-only preview panel** to each dialog:
- Small 3D viewport (300×300px) showing the wireframe with node indices.
- Updates live as user changes parameters (length, segments, etc.).
- Same color coding as custom dialog.
- This gives users visibility into node numbering before adding sources/lumped elements.

### 2.5 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `backend/preprocessor/builders.py` (custom section) | Builder | `create_custom()` + validation |
| `backend/preprocessor/schemas.py` (CustomRequest) | Schema | Custom antenna request model |
| `backend/preprocessor/main.py` (custom route) | Route | `POST /api/antenna/custom` |
| `frontend/src/features/design/CustomAntennaDialog.tsx` | Component | Import + edit + preview dialog |
| `frontend/src/utils/csvParser.ts` | Utility | CSV point/edge parser |
| `tests/unit/test_custom_builder.py` | Test | Validation, connectivity, re-indexing |
| Preview panels in existing dialogs | Frontend | Node-labeled 3D wireframe previews |

---

## Phase 3 — Lumped Element & Port System

**Goal**: Formalize a port system per antenna element. Each element has its mesh nodes + user-definable appended nodes (-1, -2, ...). Users can add arbitrary R/L/C/Source networks between any pair of nodes (mesh or appended).

**Rationale**: The solver already handles appended nodes and lumped elements between arbitrary node pairs. This phase surfaces that capability in the UI with a clear mental model.

### 3.1 — Data Model: Ports & Appended Nodes

The existing `AntennaElement` already has `sources` and `lumped_elements` lists. We enhance it:

**Updated `AntennaElement`** (`backend/common/models/geometry.py`):
```python
class AppendedNode(BaseModel):
    """A user-defined auxiliary node. Index is negative: -1, -2, ..."""
    index: int                          # -1, -2, ... (auto-assigned)
    label: str = ""                     # User-friendly name, e.g., "Matching network node"

class AntennaElement(BaseModel):
    # ... existing fields ...
    appended_nodes: list[AppendedNode] = []   # NEW
    # sources and lumped_elements already exist and can reference appended node indices
```

**Port definition for solver requests (Phase 4)**:
A port is a pair of nodes `(node_a, node_b)` where we measure voltage/current. For a 2-pole (1-port) antenna, the port is typically `(source_node_start, source_node_end)`. This is defined at solver request time, not stored in the geometry.

### 3.2 — Frontend: Dialog Tests Carried Over from Phase 0

The following dialog-level tests were deferred from Phase 0 (no active bugs, just verification). They belong here since Phase 3 reworks the dialogs:

- [ ] **DipoleDialog**: Test that orientation presets (X/Y/Z) correctly set `center_position` and `orientation` vectors. Verify gap toggle enables/disables the gap-width field.
- [ ] **LoopDialog**: Verify `normal_vector` input accepts arbitrary vectors and normalizes correctly. Test that gap position is correctly mapped when `gap=true`.
- [ ] **RodDialog**: Verify `base_position` defaults and that orientation vector is normalized before sending to backend.

### 3.3 — Frontend: Enhanced Lumped Element Dialog

**Reworked `LumpedElementDialog.tsx`**:

- **Node selector**: Dropdown showing all available nodes:
  - Mesh nodes: `1, 2, ..., N` (with coordinates shown as hint)
  - Ground: `0 (GND)`
  - Appended nodes: `-1 (label), -2 (label), ...`
  - "Add new appended node" option → creates a new `-N` node with a label prompt
- **Element type**: R, L, C, or RLC (series combination)
- **Value fields**: Resistance (Ω), Inductance (H), Capacitance (F) — with unit dropdown (nH/µH/mH/H, pF/nF/µF/F)
- **Expression support**: All value fields accept expressions from Phase 1 variable context
- **Visual**: Show a simple schematic icon (resistor zigzag, inductor coil, capacitor plates) next to the element

**Reworked `SourceDialog.tsx`**:

- Same node selector as lumped elements
- Voltage source: amplitude (complex), series R/L/C
- Current source: amplitude (complex)
- Show source polarity (+ / −) in the node selector hint

### 3.4 — Frontend: Port/Network Visualization in Preview

In the 3D preview (custom dialog and existing type previews):
- Appended nodes rendered as hollow circles (distinct from mesh nodes which are solid dots)
- Lumped elements rendered as schematic symbols on the edge between their two nodes
- Sources rendered as circled V or I symbols
- Port pairs highlighted when hovered

### 3.5 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `backend/common/models/geometry.py` update | Model | `AppendedNode` model, updated `AntennaElement` |
| `frontend/src/features/design/LumpedElementDialog.tsx` rework | Component | Node selector, unit dropdowns, expressions |
| `frontend/src/features/design/SourceDialog.tsx` rework | Component | Same node selector, polarity hint |
| `frontend/src/features/design/components/NodeSelector.tsx` | Component | Reusable node dropdown with mesh/ground/appended |
| `frontend/src/features/design/components/SchematicOverlay.tsx` | Component | Lumped element symbols in 3D preview |
| `tests/unit/test_appended_nodes.py` | Test | Appended node indexing, lumped element attachment |
| DipoleDialog / LoopDialog / RodDialog tests | Frontend | Orientation presets, gap toggle, normal vector normalization (carried from Phase 0) |
---

## Phase 4 — Solver Enhancements (Port Quantities, S11, VSWR)

**Goal**: For antennas with 2 poles (1 port = 1 voltage source feed point), compute and return reflection coefficient Γ, return loss |S11| in dB, VSWR, and input impedance per frequency. Make these first-class quantities in the response.

**Rationale**: The solver already computes `input_impedance`, `reflection_coefficient`, and `return_loss` per frequency point, and the sweep response already aggregates `impedance_magnitude`, `impedance_phase`, `return_loss`, and `vswr`. The main work is:
1. Making the port definition explicit in the request
2. Ensuring Γ and VSWR are computed correctly with user-defined Z₀  
3. Surfacing port voltage and port current as addressable quantities for plotting

### 4.1 — Backend: Port-Aware Solver Request

**Updated `FrequencySweepRequest`** (`backend/solver/schemas.py`):
```python
class PortDefinition(BaseModel):
    """Defines a measurement port (2-pole, 1-port)."""
    node_positive: int              # Node index (1-based, 0=GND, negative=appended)
    node_negative: int              # Node index
    reference_impedance: float = 50.0  # Z₀ [Ω]
    label: str = "Port 1"

class FrequencySweepRequest(BaseModel):
    # ... existing fields ...
    port: PortDefinition | None = None  # NEW — if None, auto-detect from first voltage source
```

**Solver changes** (`backend/solver/system.py`):
- If `port` is provided, compute impedance as `Z_port = V_port / I_port` where `V_port` and `I_port` are extracted from the solution vector at the port nodes.
- If `port` is `None`, fall back to existing behavior (impedance from first voltage source).
- Compute: `Γ = (Z_port - Z₀) / (Z_port + Z₀)`, `VSWR = (1 + |Γ|) / (1 - |Γ|)`, `ReturnLoss = -20 log₁₀(|Γ|)`.

**Updated sweep response**: Already has `vswr` and `return_loss` arrays — verify they populate correctly with the explicit port.

### 4.2 — Frontend: Port Definition in Solver Config

**Updated `FrequencySweepDialog.tsx`**:
- New section: "Port Definition"
  - Node+ and Node− dropdowns (same `NodeSelector` from Phase 3)
  - Reference impedance Z₀ input (default 50 Ω)
  - Auto-detect option: "Use primary voltage source as port" (default)

**Updated `solverSlice.ts`**:
- Store `port` definition in simulation config
- Map port voltage/current from solver response to named quantities

### 4.3 — Requested Quantities

The user should be able to check which quantities they want computed and returned. This is already partially modeled in `simulation_config.requested_fields`. Extend it:

**Quantity categories** (checkbox list in the solver dialog):
- [ ] Input impedance (Z)
- [ ] Reflection coefficient (Γ)
- [ ] Return loss (|S11| dB)
- [ ] VSWR
- [ ] Port voltage
- [ ] Port current

These drive what gets stored in `simulation_results` and what's available for plotting in Phase 5.

### 4.4 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `backend/solver/schemas.py` update | Schema | `PortDefinition`, updated request |
| `backend/solver/system.py` update | Solver | Port-aware Z/Γ/VSWR computation |
| `frontend/src/features/design/FrequencySweepDialog.tsx` update | Component | Port definition UI |
| `frontend/src/store/solverSlice.ts` update | Redux | Port quantities in state |
| `tests/unit/test_port_quantities.py` | Test | Γ, VSWR, return loss accuracy |

---

## Phase 5 — Generalized Line Plotting + Smith Chart

**Goal**: A unified line plot system that can plot any computed quantity vs. frequency or vs. spatial coordinate (for 1D field observations). Add Smith chart as a specialized view.

### 5.1 — Unified Plot Data Model

**New type** (`frontend/src/types/plotDefinitions.ts`):
```typescript
type PlotQuantity =
  // Port quantities (vs. frequency)
  | { source: 'port'; quantity: 'impedance_real' | 'impedance_imag' | 'impedance_magnitude' | 'impedance_phase' }
  | { source: 'port'; quantity: 'reflection_coefficient_magnitude' | 'reflection_coefficient_phase' }
  | { source: 'port'; quantity: 'return_loss' | 'vswr' }
  | { source: 'port'; quantity: 'port_voltage_magnitude' | 'port_voltage_phase' }
  | { source: 'port'; quantity: 'port_current_magnitude' | 'port_current_phase' }
  // Field quantities (vs. spatial coordinate along 1D observation line)
  | { source: 'field'; fieldId: string; quantity: 'E_magnitude' | 'H_magnitude'
      | 'Ex' | 'Ey' | 'Ez' | 'Er' | 'Etheta' | 'Ephi'
      | 'Hx' | 'Hy' | 'Hz' | 'Hr' | 'Htheta' | 'Hphi' }

interface PlotTrace {
  id: string
  quantity: PlotQuantity
  label: string                        // Legend label
  color: string                        // Line color
  lineStyle: 'solid' | 'dashed' | 'dotted'
  yAxisId: 'left' | 'right'           // Dual-axis support
}

interface PlotConfiguration {
  id: string
  name: string
  xAxis: { label: string; unit: string; scale: 'linear' | 'log' }
  yAxisLeft: { label: string; unit: string; scale: 'linear' | 'log' | 'dB' }
  yAxisRight?: { label: string; unit: string; scale: 'linear' | 'log' | 'dB' }
  traces: PlotTrace[]
}
```

### 5.2 — Enhanced AddScalarPlotDialog

Rework `AddScalarPlotDialog.tsx`:
1. **Quantity selector**: Dropdown of available quantities, grouped by category:
   - "Port" → Impedance (Real, Imag, |Z|, ∠Z), S11 (|Γ|, dB), VSWR, Voltage, Current
   - "Field: {fieldName}" → |E|, Ex, Ey, Ez, Eφ, Eθ, |H|, Hx, ... (only show fields that were defined in preprocessor and computed)
2. **Multi-trace**: User can add multiple traces to one plot (different quantities or different fields)
3. **Axis config**: Scale (linear/log/dB), axis label, unit
4. **Presets**: Quick-add buttons like "Impedance (Re + Im)", "S11 (dB)", "VSWR"

### 5.3 — Plot Rendering Engine

Update `LineViewPanel.tsx` to use the unified `PlotConfiguration`:
- Replace hardcoded ImpedancePlot/VoltagePlot/CurrentPlot with a generic `UnifiedLinePlot` component
- `UnifiedLinePlot` reads `PlotConfiguration`, extracts data from Redux (solver results for port quantities, field data for spatial quantities)
- Handle unit conversion (Hz→MHz for display, rad→deg, linear→dB)
- Recharts `LineChart` with dynamic trace count, dual Y-axis, responsive container

Keep the existing `ImpedancePlot`, `CurrentPlot`, `VoltagePlot` as legacy wrappers that create `PlotConfiguration` objects, so old saved projects still render.

### 5.4 — 1D Field Line Plotting

When a user defines a 1D observation line (Line or Arc shape in `fieldDefinitions.ts`):
- The postprocessor computes E/H at each point along the line
- Frontend extracts field components at each observation point
- X-axis = distance along the line (arc length in meters) or point index
- Y-axis = selected field component magnitude or complex part

**Data flow**:
1. User defined a Line field (start→end, N points) in preprocessor → stored in `simulation_config`
2. Solver runs → postprocessor computes fields → stored in `simulation_results` / `fieldData[fieldId]`
3. User adds a "Field: {fieldName} > |E|" trace to a line plot
4. `UnifiedLinePlot` reads `fieldData[fieldId][freqHz].E_mag` → plots vs. distance along line

### 5.5 — Smith Chart

**New component**: `frontend/src/features/postprocessing/plots/SmithChart.tsx`

**Implementation approach**:
- Custom SVG component (no external library — better control and educational value)
- Draw Smith chart grid: constant-R circles, constant-X arcs, unit circle
- Plot impedance locus: `Z(f)` normalized to `Z₀`, plotted as `Γ = (Z - Z₀)/(Z + Z₀)` on the complex plane
- Frequency markers: colored dots along the locus at specific frequencies, with tooltip on hover showing `f`, `Z`, `Γ`, `VSWR`
- Interactive: zoom, pan, hover tooltip
- Integration: available as a view item type in postprocessing (alongside 3D and line views)

**Data source**: `impedance_real` and `impedance_imag` arrays from frequency sweep → compute Γ per frequency → plot in Γ-plane.

**Smith chart grid math**:
- Constant resistance circles: center `(r/(r+1), 0)`, radius `1/(r+1)` for normalized `r`
- Constant reactance arcs: center `(1, 1/x)`, radius `1/|x|`
- Standard values: r ∈ {0, 0.2, 0.5, 1, 2, 5}, x ∈ {±0.2, ±0.5, ±1, ±2, ±5}

### 5.6 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `frontend/src/types/plotDefinitions.ts` | Types | `PlotQuantity`, `PlotTrace`, `PlotConfiguration` |
| `frontend/src/features/postprocessing/plots/UnifiedLinePlot.tsx` | Component | Generic multi-trace plot |
| `frontend/src/features/postprocessing/plots/SmithChart.tsx` | Component | Custom SVG Smith chart |
| Updated `AddScalarPlotDialog.tsx` | Component | Quantity selector, multi-trace, presets |
| Updated `LineViewPanel.tsx` | Component | Use `UnifiedLinePlot` for rendering |
| `frontend/src/features/postprocessing/plots/smithChartUtils.ts` | Utility | Grid geometry math |
| `tests/unit/test_smith_chart_math.py` | Test | Γ computation, circle/arc equations |

---

## Phase 6 — Course Submission System

**Goal**: Students enrolled in a course can submit (hand in) a project to the instructor. The submission is a frozen snapshot. The instructor sees all submissions per course and per student in read-only mode. The student also sees their own submissions as read-only copies.

### 6.1 — Backend: Submission Data Model

**New files**:
- `backend/common/repositories/submission_repository.py` — DynamoDB repository
- `backend/projects/submission_routes.py` — API routes

**DynamoDB schema** (single-table design):
```
Item: Submission
  PK: COURSE#{course_id}
  SK: SUBMISSION#{submission_id}
  GSI1PK: USER#{student_user_id}
  GSI1SK: SUBMISSION#{submission_id}

Attributes:
  submission_id: str (UUID)
  course_id: str
  student_user_id: str
  student_name: str               # Denormalized for display
  source_project_id: str          # Original project ID
  project_name: str               # Name at time of submission
  submission_number: int           # 1, 2, 3, ... per student per course
  submitted_at: str (ISO 8601)
  status: "submitted" | "reviewed" | "returned"

  # Frozen project snapshot (same 4 JSON blobs)
  design_state: dict
  simulation_config: dict
  simulation_results: dict
  ui_state: dict
```

**Naming**: The frozen copy visible to the student is named `{CourseName}_SUBMISSION_{N}` (e.g., `Antenna_Basics_SUBMISSION_1`).

### 6.2 — Backend: API Endpoints

```
POST   /api/courses/{course_id}/submissions          — Submit project (student)
GET    /api/courses/{course_id}/submissions           — List submissions (instructor: all, student: own)
GET    /api/submissions/{submission_id}               — Get submission detail (read-only project data)
PATCH  /api/submissions/{submission_id}/status         — Update status (instructor only)
GET    /api/my-submissions                            — List all my submissions across courses (student)
```

**Submit flow**:
1. Student calls `POST /api/courses/{course_id}/submissions` with `{ project_id: "..." }`.
2. Backend loads the project, verifies the student owns it.
3. Backend creates a submission record with the 4 JSON blobs copied from the project (frozen snapshot).
4. Backend computes `submission_number` = count of existing submissions by this student in this course + 1.
5. Returns `{ submission_id, submission_number, submitted_at }`.

**Permissions**:
- Students can only submit their own projects.
- Students can only view their own submissions.
- Course maintainers (instructors) can view all submissions in courses they maintain.
- Admins can view all submissions.

### 6.3 — Frontend: Student Submission Flow

**Modified `ProjectPage` / project toolbar**:
- When a project is derived from a course (has `source_course_id`), show a "Submit" button.
- Clicking "Submit" opens a confirmation dialog: "Submit this project to {CourseName}? A snapshot of the current state will be created."
- After submission, a toast notification: "Submitted as Antenna_Basics_SUBMISSION_1".

**Submission list** (`frontend/src/features/courses/MySubmissionsPage.tsx`):
- Shows table: Course | Project | Submission # | Date | Status
- Click opens submission in **read-only viewer** (same designer UI but all editing disabled).

### 6.4 — Frontend: Instructor Dashboard

**New page**: `frontend/src/features/courses/SubmissionsDashboard.tsx`

- **Per-course view**: Table of all submissions, sortable by student name, date, status.
- **Per-student collapse**: Click student row → expand to show all their submissions for that course.
- Click submission → open in **read-only viewer**.
- Status toggle: instructor can mark submissions as "reviewed" or "returned".
- No grading scores for now — just status tracking.

### 6.5 — Read-Only Viewer Mode

- Reuse the full designer + postprocessing UI.
- Pass a `readOnly: true` prop from the project load context.
- Disable: all ribbon menu actions, save, element add/edit/delete, solver run, field add.
- Enable: 3D view orbit/zoom, plot interaction, view switching, export (PDF/VTU).
- Visual indicator: yellow banner "READ-ONLY SUBMISSION — Submitted on {date}".

### 6.6 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `backend/common/repositories/submission_repository.py` | Repository | DynamoDB CRUD for submissions |
| `backend/projects/submission_routes.py` | Routes | Submit, list, get, update status |
| `backend/projects/schemas.py` additions | Schema | SubmissionCreate, SubmissionResponse, SubmissionListItem |
| `frontend/src/features/courses/MySubmissionsPage.tsx` | Page | Student submission list |
| `frontend/src/features/courses/SubmissionsDashboard.tsx` | Page | Instructor view |
| `frontend/src/store/submissionsSlice.ts` | Redux | Submission state management |
| `frontend/src/api/submissions.ts` | API | Submission API calls |
| Read-only mode across designer | Frontend | `readOnly` prop threading |

---

## Phase 7 — Structured PDF Export

**Goal**: Multi-page PDF report containing project metadata, antenna parameters, solver settings, requested fields, simulation results (plots + 3D captures), and documentation markdown content.

### 7.1 — Report Structure

```
Page 1: Cover Page
  - Project name
  - Author (user name)
  - Date
  - Course name (if applicable)
  - Antenna Educator branding/logo

Page 2: Antenna Design Summary
  - Element list: name, type, parameters table (key-value)
  - Variable definitions table (name, expression, value, unit)
  - Wire geometry statistics: N nodes, M edges, total wire length

Page 3: Solver Configuration
  - Frequency range, number of points, spacing
  - Reference impedance Z₀
  - Port definition
  - Solver settings (Gauss order, skin effect, etc.)
  - Requested quantities list

Page 4+: Results — Plots
  - Each line plot in the project → rendered as image (reuse Recharts `toPNG()`)
  - Smith chart → rendered as SVG-to-image
  - Impedance table at key frequencies (optional)

Page N-2: Results — 3D Captures
  - Each 3D view → captured via Three.js WebGL renderer `toDataURL()`
  - Radiation pattern, field magnitude, current distribution

Page N-1: Documentation
  - Render project's markdown documentation as HTML → PDF pages
  - Embedded images from S3

Page N: Footer
  - "Generated by Antenna Educator on {date}"
```

### 7.2 — Implementation

**Library**: Keep jsPDF + html2canvas for 3D captures. Add `markdown-it` for markdown-to-HTML rendering.

**New utility**: `frontend/src/utils/pdfReportGenerator.ts`
- Orchestrates multi-page generation
- Accepts: project data (design_state, simulation_config, simulation_results, ui_state, documentation)
- Renders each section programmatically (not by screenshotting the whole page)

**Updated `ExportPDFDialog.tsx`**:
- Options: resolution, which sections to include (checkboxes)
- "Include individual plots", "Include 3D views", "Include documentation"
- Progress bar during generation

### 7.3 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `frontend/src/utils/pdfReportGenerator.ts` | Utility | Multi-page PDF orchestrator |
| Updated `ExportPDFDialog.tsx` | Component | Section selection, progress |
| `frontend/src/utils/markdownRenderer.ts` | Utility | Markdown → HTML for PDF |

---

## Phase 8 — Refactoring & Hardening

**Goal**: Production-quality code, comprehensive tests, security, and operational robustness.

### 8.1 — Backend

- [ ] **Input validation**: Add Pydantic field constraints (`ge`, `le`, `max_length`) to all request schemas. Cap array sizes (max nodes, max edges, max frequencies).
- [ ] **Error handling**: Standardize error response format `{ detail: string, code: string }` across all services. Map solver numpy errors to user-friendly messages.
- [ ] **Rate limiting**: Add per-user rate limits (via middleware or API Gateway) — protect simulation endpoints.
- [ ] **Request size limits**: Cap request body size in FastAPI middleware (e.g., 10MB for custom geometry).
- [ ] **Logging**: Structured JSON logging with correlation IDs. Log all simulation requests with user_id, duration, token cost.
- [ ] **Security**:
  - Dependency audit (`pip-audit`, `npm audit`)
  - CORS: tighten origins in production (only CloudFront domain)
  - Input sanitization for project names, descriptions (prevent stored XSS)
  - Rate limit CSV upload size
- [ ] **Test coverage**: Target 80%+ for backend. Add missing tests for postprocessor, projects service, auth flows.

### 8.2 — Frontend

- [ ] **Error boundaries**: Add React error boundaries around 3D scene, plot panels, and each major feature area.
- [ ] **Loading states**: Consistent skeleton loaders for async operations (project load, solve, field computation).
- [ ] **Retry logic**: Exponential backoff for transient API failures (network errors, 502/503).
- [ ] **Bundle optimization**: Code-split by route. Lazy-load Three.js and Recharts. Analyze bundle with `vite-plugin-visualizer`.
- [ ] **Accessibility**: Keyboard navigation for key flows. ARIA labels on interactive elements.
- [ ] **Fix vitest hanging**: Resolve CI test timeout issues — likely timer/async leak in test teardown.

### 8.3 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| `backend/common/middleware/rate_limit.py` | Middleware | Per-user rate limiting |
| `backend/common/middleware/request_size.py` | Middleware | Body size cap |
| Error boundary components | Frontend | `ErrorBoundary.tsx` wrapper |
| Updated CI config | DevOps | Fix hanging tests, add coverage threshold |

---

## Phase 9 — Deployment Rework

**Goal**: One-command deployment for both local (Docker) and cloud (AWS) targets, with clear documentation.

### 9.1 — Local / Docker Deployment

- [ ] **Single `docker-compose.yml`** with profiles:
  - `docker compose up` — all services + DynamoDB Local + frontend (default)
  - Optional: `docker compose --profile monitoring up` — adds Prometheus + Grafana
- [ ] **`.env.example`** with all required environment variables, sensible defaults for local.
- [ ] **Health-check ordering**: All services depend on DynamoDB Local readiness. Frontend depends on backends.
- [ ] **Volume mounts**:
  - DynamoDB Local data → `./data/dynamodb/` (persist between restarts)
  - S3-compatible local storage (MinIO or local filesystem) → `./data/storage/`
- [ ] **Init container / script**: Auto-create DynamoDB tables, seed admin user, create example course on first run.
- [ ] **Documentation**: `docs/LOCAL_DEVELOPMENT.md` rewritten with clear start-to-finish guide.

### 9.2 — Cloud (AWS) Deployment

- [ ] **Single deploy script**: `./deploy.ps1 -Environment staging` — builds, pushes, deploys all services + frontend.
- [ ] **Environment promotion**: `./promote.ps1 -From staging -To production` — copy ECR images, update Lambda aliases.
- [ ] **Terraform cleanup**: Modularize further, add `terraform/environments/production/` config.
- [ ] **CI/CD pipeline**: CodePipeline or GitHub Actions workflow — push to `main` → deploy staging, manual approval → deploy production.
- [ ] **Secrets management**: All secrets in AWS Secrets Manager (not .env files). Lambda reads at startup.
- [ ] **Monitoring**: CloudWatch dashboards per service (invocations, errors, duration, cold starts).

### 9.3 — Deliverables

| Artifact | Type | Description |
|----------|------|-------------|
| Reworked `docker-compose.yml` | Config | Profiles, health checks, volumes |
| `.env.example` | Config | Full env var documentation |
| `scripts/init-local.sh` (and `.ps1`) | Script | First-run setup |
| `deploy.ps1` | Script | Single-command AWS deploy |
| Updated `docs/LOCAL_DEVELOPMENT.md` | Docs | Rewritten setup guide |

---

## Dependency Graph

```
Phase 0 ─── Bug Fixes & Stabilization ✅
   │
   ▼
Phase 1 ─── Variable & Parameter Management ✅
   │
   ├────────────────────┐
   ▼                    ▼
Phase 2               Phase 4
Custom Geometry       Solver Enhancements (Port Quantities)
   │                    │
   ▼                    │
Phase 3                 │
Lumped Element &        │
Port System             │
   │                    │
   ├────────────────────┘
   ▼
Phase 5 ─── Generalized Line Plotting + Smith Chart
   │
   ├───────────┐
   ▼           ▼
Phase 6     Phase 7
Submissions PDF Export
   │           │
   ├───────────┘
   ▼
Phase 8 ─── Refactoring & Hardening
   │
   ▼
Phase 9 ─── Deployment Rework
```

**Key dependencies**:
- Phase 1 (Variables) enables expression-aware inputs in Phase 2 (Custom Geometry) and Phase 3 (Lumped Elements)
- Phase 2 (Custom Geometry) + Phase 3 (Ports) must precede Phase 5 (Plotting), because 1D field lines and port quantities are what we plot
- Phase 4 (Solver enhancements) can run in parallel with Phase 2/3 since it's backend-only, but Phase 5 needs both
- Phase 6 (Submissions) and Phase 7 (PDF) are independent of each other but need Phases 1–5 complete so submissions contain full feature set
- Phase 8 and 9 are final — polish and deploy everything built in earlier phases

---

## Estimated Scope per Phase

| Phase | Backend | Frontend | Tests | Complexity | Status |
|-------|---------|----------|-------|------------|--------|
| 0 — Bug Fixes | Medium | Medium | High | Medium — many small fixes | ✅ Complete |
| 1 — Variables | Medium | High | Medium | Medium — expression parser is key risk | ✅ Complete (PR #57) + helix removal + all-field expressions + resizable panels |
| 2 — Custom Geometry | Medium | High | Medium | High — CSV parser + 3D preview + validation | ⏳ Next |
| 3 — Lumped/Ports | Low | High | Low | Medium — UI rework, model is straightforward | ⏳ Pending |
| 4 — Solver | High | Medium | High | Medium — math is known, integration matters | ⏳ Pending (can parallel with 2/3) |
| 5 — Plotting + Smith | Low | Very High | Medium | High — unified plot model + Smith chart SVG | ⏳ Pending |
| 6 — Submissions | Medium | High | Medium | Medium — CRUD + read-only mode | ⏳ Pending |
| 7 — PDF Export | Low | High | Low | Medium — multi-page layout orchestration | ⏳ Pending |
| 8 — Hardening | Medium | Medium | Very High | Medium — systematic, not creative | ⏳ Pending |
| 9 — Deployment | High | Low | Low | Medium — DevOps, scripting, Terraform | ⏳ Pending |

---

## Open Decisions (Not Blocking Start)

1. **Custom geometry subdivision**: Should future versions support Catmull-Clark or linear subdivision refinement of custom meshes? (Useful for curved structures that user defines coarsely.) → Defer to post-v1.
2. **Smith chart interactivity**: Clickable frequency markers that sync with line plots? → Nice-to-have in Phase 5, not blocking.
3. **Submission notifications**: Email/in-app notification when a student submits? → Defer to Phase 8.
4. **Multi-port (N>2)**: You said 1-port for now. When N-port S-parameters are needed later, the `PortDefinition` model extends naturally to `ports: list[PortDefinition]`. → Defer.
5. **Variable autocomplete**: Expression fields currently accept free-text. Could add a suggestion dropdown showing available variable names. → Defer to post-v1.
6. **Variable undo/redo**: Variable changes currently auto-save immediately. A proper undo stack could be added in Phase 8.
7. **Spreadsheet paste in VariablePanel**: Planned for Phase 1 but deferred. Tab-separated paste from Excel/Google Sheets could be useful for bulk variable entry. → Add if users request.

## Resolved Decisions

| Decision | Phase | Resolution |
|----------|-------|------------|
| Expression field UX: toggle vs. unified input | Phase 1 | **Unified** — single field accepts both numbers and expressions |
| Variable Panel location | Phase 1 | **Left sidebar** accordion in TreeViewPanel |
| Drag-and-drop variable reordering | Phase 1 | **No** — insertion order only, simpler UX |
| Auto-remesh vs. manual re-generate | Phase 1 | **Auto-remesh** — full preprocessor API call when variables change |
| Frontend expression parser approach | Phase 1 | **Hand-written recursive-descent** — no external dependency, mirrors backend grammar |
| design_state schema version | Phase 1 | **Version 3** — adds `variables` array and `expressions` dict on elements |
| Helix antenna removal | Phase 1 | **Removed entirely** — backend builders/endpoint/schemas + frontend dialog/thunk/API/menu/tests. `HelixConfig` kept `@deprecated` for old projects. |
| Expression scope in dialogs | Phase 1 | **ALL numeric fields** — not just geometry params; includes segments, amplitude, phase, position, orientation |
| Resizable design panels | Phase 1 | **Both left + right** — drag handles, localStorage persistence, min/max bounds |
| Sidebar panel ordering | Phase 1 | **Variables first, Structure below** — Variables collapsible (open by default), Structure collapsible |
