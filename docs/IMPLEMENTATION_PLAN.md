# Antenna Educator — Implementation Plan

> Created: 2026-03-26 | Target: Production-ready educational EM simulation platform

---

## Table of Contents

1. [Phase 0 — Bug Fixes & Stabilization](#phase-0--bug-fixes--stabilization)
2. [Phase 1 — Variable & Parameter Management](#phase-1--variable--parameter-management)
3. [Phase 2 — Custom Antenna Geometry (CSV Import + Visual Editor)](#phase-2--custom-antenna-geometry-csv-import--visual-editor)
4. [Phase 3 — Lumped Element & Port System](#phase-3--lumped-element--port-system)
5. [Phase 4 — Solver Enhancements & On-Demand Postprocessing](#phase-4--solver-enhancements-port-quantities-s11-vswr)
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

## Phase 2 — Custom Antenna Geometry (CSV Import + Visual Editor) ✅ COMPLETE

**Goal**: Allow users to define arbitrary wire antenna structures by importing CSV point/connection files or using a visual sub-GUI editor, with clear node/edge labeling.

**Rationale**: With variables in place (Phase 1 ✅), coordinate expressions can reference variables. This is the most impactful preprocessor feature — it unlocks any wire antenna geometry the PEEC solver can handle.

**Prerequisites**: Phase 1 complete ✅ — `ExpressionField`, `variablesSlice`, `parseNumericOrExpression()`, and `evaluateVariableContextNumeric()` are all available for use in the custom geometry editor.

### 2.1 — CSV Format Definition ✅ Done

**Implemented format**: Combined single-file CSV (`frontend/src/utils/csvParser.ts`):

```csv
# NODES — N, id, x, y, z [, P]
# P = port node (feed point), omitted = regular node
N, 1, 0.0, 0.0, 0.0
N, 2, 0.0, 0.0, 0.05, P
N, 3, 0.0, 0.0, -0.05
# EDGES — E, node_start, node_end [, radius]
E, 1, 2
E, 1, 3, 0.0005
```

- **Node types**: `regular` (default) and `port` (P). Full-word `PORT` flag also accepted.
- Ground and lumped node types are **deferred to Phase 3** (lumped element & port system).
- Comments (`#`) and blank lines ignored. Case-insensitive prefixes.
- Supports negative coordinates, scientific notation, Windows line endings.
- Returns `CsvParseResult` with `nodes[]`, `edges[]`, `warnings[]`, `errors[]`.
- **Validation**: duplicate node IDs, missing node references, self-loops, duplicate/reverse-duplicate edges, NaN/Inf coordinates, non-positive IDs, negative radius.
- **35 unit tests** in `frontend/src/utils/__tests__/csvParser.test.ts`.

> **Note**: The original two-file format (separate points.csv + connections.csv) was not implemented. The combined single-file format is simpler and sufficient.

### 2.2 — Backend: Custom Builder ✅ Done

**Implemented files**:
- `backend/preprocessor/builders.py` — `create_custom()` + `custom_to_mesh()` ✅
- `backend/preprocessor/schemas.py` — `CustomRequest`, `CustomNodeInput`, `CustomEdgeInput` ✅
- `backend/preprocessor/main.py` — `POST /api/antenna/custom` endpoint ✅
- `tests/unit/test_custom_builder.py` — **21 validation tests** ✅

**CustomRequest schema** (as implemented):
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
    variable_context: dict[str, str] | None = None  # For expression evaluation
```

**Builder validation** (all implemented with tests):
- All node IDs must be unique positive integers.
- All edge references must point to existing node IDs.
- No duplicate edges (same start+end or end+start).
- No self-loop edges.
- At least 1 edge required, at least 1 node required.
- Node coordinates must be finite (no NaN/Inf).
- Radius must be positive (nodes and edges).

**Mesh construction**: Direct mapping — nodes → `mesh.nodes`, edges → `mesh.edges`. No interpolation or subdivision (user controls resolution). Re-index to 1-based contiguous if IDs have gaps.

### 2.3 — Frontend: CSV Import & Custom Antenna Dialog ✅ Done

**Implemented files**:
- `frontend/src/features/design/CustomAntennaDialog.tsx` — Main dialog (create + edit mode)
- `frontend/src/utils/csvParser.ts` — CSV parsing utility
- `frontend/src/components/WirePreview3D.tsx` — Shared 3D wireframe preview component

**Dialog features** (as implemented):
1. User clicks "Custom" in ribbon menu → opens `CustomAntennaDialog`.
2. **Tab 0: Import CSV** — File upload + paste from clipboard. Parses combined single-file CSV format. Validation errors/warnings shown inline.
3. **Tab 1: Manual Editor** — Editable node/edge tables with Add/Remove buttons. Node ID auto-incremented.
4. **3D Preview** (right-side panel, always visible) — `WirePreview3D` component with:
   - Node labels (IDs) rendered at each node position.
   - Edge labels (indices) at edge midpoints.
   - NodeType-based coloring: regular (blue `#6699cc`), port (red `#ff4444` + torus marker).
   - Selected node highlighting (yellow `#ffff00`).
   - Clickable node selection, interactive orbit/zoom, auto-fit camera.
5. **Edit mode**: `initialData` prop populates name, nodes, edges, and pre-maps `sourceNodeIds` to port node type. Triggered via "Edit Geometry" context menu in `TreeViewPanel`.

**Additional UI integration**:
- `TreeViewPanel.tsx` — "Edit Geometry" context menu item for custom antenna elements (calls `onElementEdit` callback).
- `PropertiesPanel.tsx` — Custom type guard: hides geometry/orientation controls for custom antennas (edit via dialog only, shows color picker only).

> **Deferred**: Source/lumped tab with 3D node picker, variable expression integration in coordinate fields.

### 2.4 — Frontend: Geometry Sub-GUI for Existing Types ✅ Done

For the 3 existing types (dipole, loop, rod), **3D preview panels** added to each dialog:
- `WirePreview3D` component integrated into `DipoleDialog`, `LoopDialog`, and `RodDialog`.
- Shows wireframe with node indices, updates live as user changes parameters.
- Same nodeType-based color coding as custom dialog.
- Gives users visibility into node numbering before adding sources/lumped elements.

> **Note**: `HelixDialog` was removed (helix antenna type removed from backend). Empty stub remains for backward compatibility.

### 2.5 — Code Quality & CI Fixes ✅ Done

ESLint warning reduction from **355 → 261 warnings** across 47 files:
- Fixed `@typescript-eslint/no-unused-vars` (most common — 145 cases across 47 files).
- Fixed `@typescript-eslint/no-explicit-any` in several utility files.
- Fixed `no-empty-pattern` destructuring in test files.
- Removed unnecessary `eslint-disable` directives flagged by `--report-unused-disable-directives`.
- CI now passes with 0 errors, 261 warnings (threshold: 350).

### 2.6 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `backend/preprocessor/builders.py` (custom section) | Builder | ✅ Done | `create_custom()` + `custom_to_mesh()` + validation |
| `backend/preprocessor/schemas.py` (CustomRequest) | Schema | ✅ Done | `CustomRequest`, `CustomNodeInput`, `CustomEdgeInput` |
| `backend/preprocessor/main.py` (custom route) | Route | ✅ Done | `POST /api/antenna/custom` |
| `frontend/src/features/design/CustomAntennaDialog.tsx` | Component | ✅ Done | Import CSV + manual editor + 3D preview + edit mode |
| `frontend/src/utils/csvParser.ts` | Utility | ✅ Done | Combined single-file CSV parser with node types |
| `frontend/src/components/WirePreview3D.tsx` | Component | ✅ Done | Shared 3D wireframe preview with nodeType coloring |
| `frontend/src/utils/__tests__/csvParser.test.ts` | Test | ✅ Done | 37 unit tests for CSV parser |
| `tests/unit/test_custom_builder.py` | Test | ✅ Done | 21 validation tests for custom builder |
| `TreeViewPanel.tsx` — "Edit Geometry" menu | Frontend | ✅ Done | Context menu for editing custom antenna geometry |
| `PropertiesPanel.tsx` — custom type guard | Frontend | ✅ Done | Hides geometry controls for custom type |
| 3D previews in DipoleDialog, LoopDialog, RodDialog | Frontend | ✅ Done | Node-labeled wireframe previews |

### 2.7 — Known Limitations & Remaining Work

- **No `CustomAntennaDialog.test.tsx`**: Unit tests for the dialog component are not yet written.
- **No variable expression integration**: Coordinate fields in the manual editor do not yet accept Phase 1 variable expressions.
- **No two-file CSV import**: Only the combined single-file format is implemented.
- **HelixDialog removed**: Helix antenna type was removed from backend; dialog is an empty stub.
- **Ground/lumped node types deferred**: Only `regular` and `port` node types are supported in Phase 2. Ground (`G`) and lumped (`L`) node types will be added in Phase 3 when the lumped element & port system is implemented.

---

## Phase 3 — Lumped Element & Port System ✅ COMPLETE

**Goal**: Formalize a port system per antenna element. Each element has its mesh nodes + user-definable appended nodes (-1, -2, ...). Users can add arbitrary R/L/C/Source networks between any pair of nodes (mesh or appended).

**Rationale**: The solver already handles appended nodes and lumped elements between arbitrary node pairs. This phase surfaces that capability in the UI with a clear mental model.

**Status**: Implemented in PR #59 on branch `phase3/lumped-element-port-system`. Includes 5 rounds of bug fixes (terminal indices, parallel edges, dark mode, C_inv solver bug, dipole segments convention, delete support).

### 3.1 — Data Model: Ports & Appended Nodes ✅ Done

**Updated `AntennaElement`** (`backend/common/models/geometry.py`):
```python
class AppendedNode(BaseModel):
    """A user-defined auxiliary node. Index is negative: -1, -2, ..."""
    index: int                          # -1, -2, ... (auto-assigned, validated negative)
    label: str = ""                     # User-friendly name

class AntennaElement(BaseModel):
    # ... existing fields ...
    appended_nodes: list[AppendedNode] = []   # With unique index validation
```

### 3.2 — Frontend: Circuit Editor ✅ Done

**React Flow-based circuit editor** (`frontend/src/features/design/circuit/`):
- `CircuitEditor.tsx` — Full-screen dialog with React Flow canvas, component palette, dark theme
- `CircuitNodeTypes.tsx` — Custom node types: GND (ground), Terminal (mesh feed nodes), Appended (user-created)
- `CircuitEdgeTypes.tsx` — Custom edge rendering with schematic symbols (R zigzag, L bumps, C plates, V/I circles), parallel edge offset, Alt+click label drag
- `ComponentEditDialog.tsx` — Inline editing of R/L/C/V-source/I-source values with expression support
- Delete support via Backspace/Delete keys (cascading delete of connected components)
- Accessed via "Edit Circuitry" button in ribbon menu (disabled when no element selected)

**Type conversions** (`frontend/src/types/circuitTypes.ts`):
- `circuitToBackend()` — Circuit state → sources, lumped_elements, appended_nodes
- `backendToCircuit()` — Backend data → React Flow nodes/edges with coordinate hints
- `nextAppendedIndex()` — Returns next available negative index
- C ↔ C_inv conversion for capacitors, phase → complex amplitude for sources

### 3.3 — Bug Fixes (5 rounds)

- Terminal node indices corrected to use backend feed position labels
- Parallel edges offset with quadratic bezier curves (60px offset)
- Dark mode CSS overrides for React Flow controls
- Solver `C_inv` bug in multi-antenna load renumbering (`solver.py`)
- Edit Circuitry disabled when no element selected
- Label drag changed from right-click (conflicted with context menu) to Alt+left-click
- Frontend validation fixed to allow negative node indices (appended nodes)
- Dipole `segments` convention aligned: parameter is now TOTAL segments (split equally for gap dipoles)
- Delete key handling with cascading component removal

### 3.4 — Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Editor approach** | React Flow graph editor (not modal dialog) | Visual, interactive, supports arbitrary topologies |
| **Component types** | R, L, C, Voltage Source, Current Source | Matches solver's Load/VoltageSource/CurrentSource |
| **Node selection** | Inline in React Flow (click nodes to connect) | More intuitive than dropdown-based selection |
| **SchematicOverlay in 3D** | Deferred — not needed for current workflow | Circuit editor provides the schematic view |
| **Standalone NodeSelector** | Skipped — React Flow handles node selection | No reusable dropdown needed |

### 3.5 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `backend/common/models/geometry.py` update | Model | ✅ Done | `AppendedNode` model + `AntennaElement.appended_nodes` |
| `frontend/src/features/design/circuit/CircuitEditor.tsx` | Component | ✅ Done | React Flow editor with component palette |
| `frontend/src/features/design/circuit/ComponentEditDialog.tsx` | Component | ✅ Done | Value/phase editing with expression support |
| `frontend/src/features/design/circuit/CircuitNodeTypes.tsx` | Component | ✅ Done | GND, Terminal, Appended node rendering |
| `frontend/src/features/design/circuit/CircuitEdgeTypes.tsx` | Component | ✅ Done | Schematic symbols, parallel edge offset |
| `frontend/src/types/circuitTypes.ts` | Types | ✅ Done | Type definitions, conversion functions |
| `tests/unit/test_appended_nodes.py` | Test | ✅ Done | 60+ backend tests for AppendedNode model |
| `frontend/src/types/__tests__/circuitTypes.test.ts` | Test | ✅ Done | 30+ tests for type conversions |
| `frontend/src/store/__tests__/designSlice.circuit.test.ts` | Test | ✅ Done | Circuit state management tests |

### 3.6 — Remaining Items (Completed in Phase 4 branch)

These items were deferred from Phase 0/3 and were backfilled as TDD in the Phase 4 branch (`phase4/solver-enhancements`, PR #60):

- [x] **DipoleDialog UI tests**: Orientation presets (X/Y/Z), gap toggle
- [x] **LoopDialog UI tests**: Normal vector normalization, gap position mapping
- [x] **RodDialog UI tests**: base_position defaults, orientation normalization
- [x] **CircuitEditor.test.tsx**: Component-level tests
- [x] **ComponentEditDialog.test.tsx**: Component-level tests
- [x] **Circuit editor IEEE symbols**: Replace current schematic symbols with proper IEEE/IEC standard symbols — zigzag resistor, semicircular coil inductor, parallel-plate capacitor, circled V/I sources (24-unit viewBox SVG paths in `CircuitEdgeTypes.tsx`)
- [x] **Circuit editor auto-layout**: dagre-based TB auto-layout in `frontend/src/features/design/circuit/autoLayout.ts` (6 tests); "Auto Layout" button (AccountTree icon) in CircuitEditor toolbar
---

## Phase 4 — Solver Enhancements & On-Demand Postprocessing

**Goal**: (1) Port quantities (Γ, S11, VSWR, Z_in) with explicit port definitions. (2) Parameter variation system. (3) On-demand postprocessing — solve returns currents only, user explicitly requests port quantities and field computations. (4) Merge frequency sweep and parameter study into unified "Parameter Sweep". (5) Circuit editor: ports as components + IEEE symbols + auto-layout.

**Status**: Sections 4.0–4.4 complete (PR #60). Sections 4.6–4.9 in progress.

**Rationale**: The solver already computes `input_impedance`, `reflection_coefficient`, and `return_loss` per frequency point. The main work is making the port definition explicit, adding proper Γ/VSWR with user-defined Z₀, and building a general parameter sweep system that treats frequency as just another variable.

### 4.0 — Phase 3 Test Backfill & Circuit Editor Polish ✅ Done

Carried over from Phase 3 — completed first (TDD). All committed in PR #60.

**Dialog UI tests** (deferred from Phase 0):
- [x] `DipoleDialog.test.tsx` — Orientation presets (X/Y/Z buttons), gap toggle enables/disables gap-width field
- [x] `LoopDialog.test.tsx` — Normal vector accepts arbitrary vectors, auto-normalization, gap position mapping
- [x] `RodDialog.test.tsx` — base_position defaults, orientation vector normalization before backend call

**Circuit component tests**:
- [x] `CircuitEditor.test.tsx` — Component palette, add/delete appended nodes, connect components
- [x] `ComponentEditDialog.test.tsx` — Value/phase fields, node selection, expression evaluation

**Circuit editor UX polish**:
- [x] **IEEE/IEC standard symbols**: Proper standard symbols implemented in `CircuitEdgeTypes.tsx` (zigzag resistor, semicircular coil inductor, parallel-plate capacitor, circled V/I sources — SVG paths on 24-unit viewBox)
- [x] **Auto-layout**: dagre-based TB auto-layout in `frontend/src/features/design/circuit/autoLayout.ts` (6 tests); "Auto Layout" button (AccountTree icon) in CircuitEditor toolbar triggers layout

### 4.1 — Backend: Port-Aware Solver Request ✅ Done

**Investigation result**: The backend already had full port quantity support before Phase 4 began — `reference_impedance`, `input_impedance`, `vswr`, `return_loss`, and `reflection_coefficient` were all present in `FrequencyPointResponse` and `SweepResultResponse` in `backend/solver/schemas.py`. No new backend changes were needed.

The existing implementation computes:
- `Γ = (Z_port - Z₀) / (Z_port + Z₀)` using the first voltage source as the port
- `VSWR = (1 + |Γ|) / (1 - |Γ|)`
- `return_loss = -20 log₁₀(|Γ|)` dB

No `PortDefinition` model was added — the existing auto-detection from the first voltage source is sufficient for current use cases.

### 4.2 — Parameter Variation System ✅ Done

**Core concept**: Frequency is treated as just another variable (`freq` from the variable panel). The user can sweep any 1 or 2 variables (including frequency) over a defined range. This replaces the hardcoded frequency sweep with a general parametric study engine.

**Files created**:
- `frontend/src/types/parameterStudy.ts` — `SweepVariable`, `ParameterStudyConfig`, `GridPoint`, `ParameterPointResult`, `ParameterStudyResult`; pure helpers `generateSweepValues()`, `buildSweepGrid()`, `needsRemesh()` (16 tests)
- `frontend/src/types/parameterStudyExtract.ts` — `extractPortQuantities()` helper that extracts Impedance/VSWR/ReturnLoss/Γ from `ParameterStudyResult` for a given axis variable (9 tests)
- `frontend/src/store/parameterStudyThunks.ts` — `runParameterStudy` async thunk: builds cartesian grid → overrides variables → conditionally remeshes → calls `solveMultiAntenna` per point → collects `ParameterStudyResult` (9 tests)
- `frontend/src/store/solverSlice.ts` — Updated with `parameterStudy: ParameterStudyResult | null` and `parameterStudyConfig: ParameterStudyConfig | null` state fields

**Execution model** (frontend-driven):
1. Frontend generates the parameter grid (1D or N1×N2 cartesian for 2D sweep)
2. For each grid point: override swept variable(s) in variable context → conditionally remesh (only if non-`freq` variable changed) → call solver → collect results
3. `needsRemesh()` skips remesh when only `freq` changes (mesh is frequency-independent for PEEC)
4. Aggregate into `ParameterStudyResult` indexed by swept parameter values

### 4.3 — Frontend: Solver Dialog Rework ✅ Done

**New component**: `frontend/src/features/design/ParameterStudyDialog.tsx` (10 tests)

Replaces the concept of `FrequencySweepDialog`. Accessible via "Study" button (TuneIcon) in the SolverTab ribbon.

1. **Variable selection**: Up to 2 sweep variables from all user-defined variables. Default: `freq`.
2. **Per-variable config**: Min, Max, N points, Linear/Log spacing
3. **Grid info**: Shows total point count (N₁ × N₂ for 2D, N for 1D)
4. **Progress feedback**: Progress bar showing `point X of N` during sweep execution
5. **Wired into SolverTab**: dispatches `runParameterStudy` thunk; results stored in `solverSlice.parameterStudy`

### 4.4 — Frontend: Results Visualization ✅ Done

**Files created**:
- `frontend/src/features/postprocessing/plots/ParameterStudyPlot.tsx` — Split-panel result viewer with 4 tabs: Impedance, VSWR, Return Loss, Smith Chart (8 tests). Uses `extractPortQuantities()` from `parameterStudyExtract.ts`. Appears below the 3D view in SolverTab once a study completes.
- `frontend/src/features/postprocessing/plots/SmithChart.tsx` — Custom SVG Smith chart with no external dependency (13 tests, implemented ahead of Phase 5 schedule):
  - Grid: constant-R circles at r ∈ {0, 0.2, 0.5, 1, 2, 5}, constant-X arcs at x ∈ {±0.2, ±0.5, ±1, ±2, ±5}
  - Γ math: `impedanceToGamma(r, x, z0)` pure function (exported for unit testing)
  - Impedance locus plotted as colored line; dots at each frequency with hover tooltip showing f, Z, Γ, VSWR
  - Pure SVG — no external library

**1-variable sweep**: Standard x-y Recharts `LineChart` (x = swept variable, y = selected quantity)

**2-variable sweep**: Family-of-curves — one line per value of variable 2, plotted against variable 1

### 4.5 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `frontend/src/features/design/__tests__/DipoleDialog.test.tsx` | Test | ✅ Done | Orientation presets, gap toggle |
| `frontend/src/features/design/__tests__/LoopDialog.test.tsx` | Test | ✅ Done | Normal vector, gap position |
| `frontend/src/features/design/__tests__/RodDialog.test.tsx` | Test | ✅ Done | Base position, orientation |
| `frontend/src/features/design/circuit/__tests__/CircuitEditor.test.tsx` | Test | ✅ Done | Component palette, connections |
| `frontend/src/features/design/circuit/__tests__/ComponentEditDialog.test.tsx` | Test | ✅ Done | Value editing, expressions |
| `frontend/src/features/design/circuit/autoLayout.ts` | Utility | ✅ Done | dagre TB auto-layout, 6 tests |
| Circuit editor IEEE symbols | Frontend | ✅ Done | Zigzag R, coil L, plate C, circle V/I in `CircuitEdgeTypes.tsx` |
| `frontend/src/types/parameterStudy.ts` | Types | ✅ Done | `SweepVariable`, `ParameterStudyConfig`, grid/point types, pure helpers (16 tests) |
| `frontend/src/types/parameterStudyExtract.ts` | Utility | ✅ Done | `extractPortQuantities()` — extract Impedance/VSWR/ReturnLoss/Γ (9 tests) |
| `frontend/src/store/parameterStudyThunks.ts` | Redux | ✅ Done | `runParameterStudy` thunk — grid execution engine (9 tests) |
| `frontend/src/store/solverSlice.ts` update | Redux | ✅ Done | `parameterStudy` + `parameterStudyConfig` state fields |
| `frontend/src/features/design/ParameterStudyDialog.tsx` | Component | ✅ Done | Up to 2-variable sweep config dialog (10 tests) |
| `frontend/src/features/postprocessing/plots/ParameterStudyPlot.tsx` | Component | ✅ Done | Split-panel result viewer — Impedance/VSWR/ReturnLoss/Smith tabs (8 tests) |
| `frontend/src/features/postprocessing/plots/SmithChart.tsx` | Component | ✅ Done | Custom SVG Smith chart, `impedanceToGamma()` pure fn (13 tests) — implemented ahead of Phase 5 |
| Backend port quantities (`vswr`, `return_loss`, `reference_impedance`) | Backend | ✅ Done (pre-existing) | Already in `FrequencyPointResponse` / `SweepResultResponse` before Phase 4 |

### 4.6 — Port as Circuit Component ✅ Done

**Concept**: A *port* is a 2-terminal measurement probe placed between two nodes of an antenna — analogous to connecting a VNA probe. Defined in the circuit editor alongside R/L/C/VS/CS. Each port has a characteristic impedance Z₀ (default 50 Ω). Ports are persisted on the `AntennaElement` (like `sources` and `lumped_elements`).

**Frontend model** (`frontend/src/types/models.ts`):
```typescript
export interface Port {
  id: string            // UUID
  node_start: number    // 1-based mesh node index
  node_end: number      // 1-based mesh node index (0 = ground)
  z0: number            // Characteristic impedance [Ω], default 50
  label?: string        // User label, e.g. "Port 1"
}
```

**Type extension** (`frontend/src/types/circuitTypes.ts`):
- Added `'port'` to `CircuitComponentType` union
- Added port to `COMPONENT_DEFAULTS` (symbol `P`, unit `Ω`, default 50) and `COMPONENT_TYPE_LABELS`
- Updated `circuitToBackend()` to extract and return `ports: Port[]` alongside sources/lumped_elements
- Updated `backendToCircuit()` to accept `existingPorts?: Port[]` and reconstruct port edges in the circuit graph

**Circuit editor**:
- `CircuitEdgeTypes.tsx`: Port SVG symbol — dashed circle with "P" label, purple color (`#9c27b0`)
- `CircuitEditor.tsx`: `onApply` callback now includes `ports` in its data; `PALETTE_ITEMS` and `PALETTE_COLORS` include `'port'`
- `DesignPage.tsx`: `handleCircuitApply` accepts and dispatches `ports`
- `designSlice.ts`: `setElementCircuit` reducer persists `ports?: Port[]` onto the element

**Persistence**: `AntennaElement.ports?: Port[]` stored in `design_state` JSON blob.

### 4.7 — On-Demand Postprocessing ✅ Done

**Principle**: `Solve Single` returns currents/voltages only — no automatic far-field, near-field, or port quantity computation. The user explicitly requests postprocessing via separate buttons.

**Investigation result**: `solveSingleFrequencyWorkflow` already did NOT auto-dispatch any postprocessing — the on-demand model was already in place. No changes to the solve flow were needed.

**UI (SolverTab ribbon)** — implemented changes:
- **"Solve Single"** — unchanged (opens FrequencyInputDialog, dispatches `solveSingleFrequencyWorkflow`)
- **"Parameter Sweep"** — replaces both "Sweep" and "Study" buttons (see §4.8)
- **"Compute Fields"** — renamed from "Compute Postprocessing" for clarity (same handler, triggers `computePostprocessingWorkflow`)
- **"Port Quantities"** — new button next to "Compute Fields"; enabled when solver state is `'solved'` or `'postprocessing-ready'` AND at least one element has ports; disabled with tooltip if no ports defined; dispatches `requestPortQuantities` thunk → results stored in `solverSlice.portResults`; uses `SettingsInputComponentIcon`

### 4.8 — Merge Sweep into Parameter Sweep ✅ Done

**Concept**: Remove the separate "Sweep" button and `FrequencySweepDialog`. The existing `ParameterStudyDialog` already treats frequency as just another variable. Rename "Study" → "Parameter Sweep".

**Changes made**:
- Removed `FrequencySweepDialog` import, `sweepDialogOpen` state, `lastSweepParams` state, `handleSweep` handler, and `handleFrequencySweepSubmit` handler from `SolverTab.tsx`
- Removed `FrequencySweepDialog` JSX from dialogs section
- Removed "Sweep" button from ribbon `ButtonGroup`
- Renamed "Study" button label to "Parameter Sweep" (keeps `TuneIcon`)
- Removed unused imports: `ShowChartIcon`, `runFrequencySweep`, `convertElementToAntennaInput`, `FrequencySweepParams`, `MultiAntennaRequest` from `SolverTab.tsx`
- `runFrequencySweep` thunk in `solverSlice.ts` retained (still used internally by `parameterStudyThunks.ts`); `FrequencySweepParams` type retained for backward compat
- `ParameterStudyDialog` unchanged — already fully functional

### 4.9 — Backend: Port Quantities Endpoint ✅ Done

**New endpoint** on the **postprocessor** service:

```
POST /api/port-quantities
```

**Request schema** (`PortQuantitiesRequest`):
```python
class PortDefinition(BaseModel):
    port_id: str
    node_start: int       # 1-based
    node_end: int          # 0 = ground
    z0: float = 50.0       # Reference impedance [Ω]

class PortQuantitiesRequest(BaseModel):
    frequency: float                              # Hz
    antenna_id: str
    node_voltages: List[complex]                  # From solver result
    branch_currents: List[complex]                # From solver result
    appended_voltages: List[complex] = []
    voltage_source_currents: List[complex] = []
    edges: List[List[int]]                        # Mesh edges for current lookup
    ports: List[PortDefinition]
```

**Response schema** (`PortQuantitiesResponse`):
```python
class PortResult(BaseModel):
    port_id: str
    z_in: complex            # Input impedance [Ω]
    gamma: complex           # Reflection coefficient
    s11_db: float            # Return loss [dB]
    vswr: float              # VSWR
    voltage: complex         # Port voltage [V]
    current: complex         # Port current [A]
    power_in: float          # Input power [W]

class PortQuantitiesResponse(BaseModel):
    antenna_id: str
    frequency: float
    port_results: List[PortResult]
```

**Computation logic**:
- `V_port = V(node_start) - V(node_end)` (node_end=0 → V=0 for ground)
- `I_port` = current through the edge connecting the two port nodes (or sum of currents into node_start)
- `Z_in = V_port / I_port`
- `Γ = (Z_in - Z₀) / (Z_in + Z₀)`
- `S11 = 20 * log10(|Γ|)` [dB]
- `VSWR = (1 + |Γ|) / (1 - |Γ|)`
- `P_in = 0.5 * Re(V_port * conj(I_port))`

**Export**: Results can be exported as VTK/CSV via existing export infrastructure.

### 4.10 — Deliverables (§4.6–4.9)

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `Port` interface in `models.ts` | Types | ✅ Done | Port model (id, node_start, node_end, z0, label) |
| `AntennaElement.ports` field | Types | ✅ Done | Persisted port definitions on antenna elements |
| `'port'` in `CircuitComponentType` | Types | ✅ Done | Port type, COMPONENT_DEFAULTS, COMPONENT_TYPE_LABELS |
| Port symbol in `CircuitEdgeTypes.tsx` | Frontend | ✅ Done | Dashed circle with "P" label, purple (#9c27b0) |
| `circuitToBackend()` / `backendToCircuit()` updated | Frontend | ✅ Done | Extract/restore `ports: Port[]` in conversion functions |
| `CircuitEditor.tsx` palette + `onApply` updated | Frontend | ✅ Done | `PALETTE_ITEMS`/`PALETTE_COLORS` include port; `onApply` passes `ports` |
| `DesignPage.tsx` + `designSlice.ts` updated | Frontend | ✅ Done | `handleCircuitApply` and `setElementCircuit` reducer persist ports |
| `POST /api/port-quantities` | Backend | ✅ Done | `postprocessor/main.py`: `_compute_port_quantities()` logic + auth endpoint |
| `PortDefinition` / `PortQuantitiesRequest` / `PortResult` / `PortQuantitiesResponse` | Backend | ✅ Done | `postprocessor/models.py`: Pydantic schemas |
| `computePortQuantities()` API function | Frontend | ✅ Done | `frontend/src/api/postprocessor.ts`: typed API client |
| `requestPortQuantities` thunk + `portResults` state | Redux | ✅ Done | `solverSlice.ts`: thunk + reducers + `selectPortResults` selector |
| "Port Quantities" button in SolverTab | Frontend | ✅ Done | Ribbon button; enabled when solved + ports exist; dispatches `requestPortQuantities` |
| "Compute Fields" rename (was "Compute Postprocessing") | Frontend | ✅ Done | Clearer UI label in SolverTab ribbon |
| Remove "Sweep" button + `FrequencySweepDialog` | Frontend | ✅ Done | Replaced by "Parameter Sweep" (§4.8) |
| Rename "Study" → "Parameter Sweep" | Frontend | ✅ Done | Button label update in SolverTab |
| SolverTab tests updated | Test | ✅ Done | Button text assertions updated; `portResults: null` added to mock state |
| `PortQuantitiesDialog.tsx` | Frontend | ⏳ Deferred | Not needed — "Port Quantities" button fires directly without a config dialog |

---

## Phase 5 — Generalized Line Plotting + Smith Chart

**Goal**: A unified line plot system that can plot any computed quantity vs. frequency or vs. any swept parameter. Add Smith chart as a specialized view. Build on Phase 4's parameter study results.

**Prerequisite**: Phase 4 complete — port quantities and parameter study data available in Redux.

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

> **Note**: The Smith chart was implemented early in Phase 4 (`phase4/solver-enhancements`, PR #60) as part of the parameter study results visualization. See `frontend/src/features/postprocessing/plots/SmithChart.tsx` (13 tests, `impedanceToGamma(r, x, z0)` exported pure function, pure SVG — no external library). The Phase 5 task is to **integrate it into the unified postprocessing view system** (as a selectable view type alongside 3D and line views) and enable interactive zoom/pan.

**New component** (Phase 5 scope — integration into postprocessing views): surface in `AddScalarPlotDialog` as a view type; wire to `simulation_results` impedance arrays from frequency sweep (not just parameter study).

**Smith chart grid math** (already implemented in Phase 4):
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
   ▼                    │
Phase 2 ✅              │
Custom Geometry         │
   │                    │
   ▼                    │
Phase 3 ✅              │
Lumped Element &        │
Port System             │
   │                    │
   ├────────────────────┘
   ▼
Phase 4 ─── Solver Enhancements & On-Demand Postprocessing
   │         4.0–4.4 ✅ (param study, Smith chart, circuit editor polish)
   │         4.6–4.9 ⬜ (ports, on-demand postprocessing, Parameter Sweep merge)
   ▼
Phase 5 ─── Generalized Line Plotting + Smith Chart integration
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
- Phase 1 (Variables) enables expression-aware inputs in Phase 2 (Custom Geometry) and Phase 3 (Lumped Elements) — both ✅ complete
- Phase 4 (Solver enhancements + parameter variation) depends on Phase 3 (port system) and uses Phase 1 variables as sweep parameters
- Phase 5 (Plotting) needs Phase 4 complete — port quantities and parameter study data to plot
- Phase 6 (Submissions) and Phase 7 (PDF) are independent of each other but need Phases 1–5 complete so submissions contain full feature set
- Phase 8 and 9 are final — polish and deploy everything built in earlier phases

---

## Estimated Scope per Phase

| Phase | Backend | Frontend | Tests | Complexity | Status |
|-------|---------|----------|-------|------------|--------|
| 0 — Bug Fixes | Medium | Medium | High | Medium — many small fixes | ✅ Complete |
| 1 — Variables | Medium | High | Medium | Medium — expression parser is key risk | ✅ Complete (PR #57) + helix removal + all-field expressions + resizable panels |
| 2 — Custom Geometry | Medium | High | Medium | High — CSV parser + 3D preview + validation | ✅ Complete (PR #58) |
| 3 — Lumped/Ports | Low | High | Low | Medium — UI rework, model is straightforward | ✅ Complete (PR #59) |
| 4 — Solver | High | Medium | High | Medium — math is known, integration matters | ⏳ Next |
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
