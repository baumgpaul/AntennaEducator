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

## Phase 4 — Solver Enhancements & On-Demand Postprocessing ✅ COMPLETE (PR #60)

**Goal**: (1) Port quantities (Γ, S11, VSWR, Z_in) with explicit port definitions. (2) Parameter variation system. (3) On-demand postprocessing — solve returns currents only, user explicitly requests port quantities and field computations. (4) Merge frequency sweep and parameter study into unified "Parameter Sweep". (5) Circuit editor: ports as components + IEEE symbols + auto-layout.

**Status**: Sections 4.0–4.11 complete ✅ (PR #60, merged). All known bugs fixed.

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

### 4.11 — Unified Solver/Sweep Refactor ✅ Done

**Goal**: Eliminate the confused mix of single-solve vs sweep state. Enforce a clean "one active solution" model where the same postprocessing workflow handles both cases uniformly.

**Root cause of current bugs**:
- `isSweepMode` checked `frequencySweep.frequencies.length > 1` — FALSE for geometry-only sweeps (1 unique frequency), so fields were only computed once
- `computePostprocessingWorkflow` iterated unique *frequencies*, not sweep *points* — geometry sweeps at a fixed frequency were treated as single-solve
- Field data keyed by `frequencyHz` — can't distinguish two sweep points at the same frequency but different geometry
- After nominal solve inside `runParameterStudy`, the `runMultiAntennaSimulation.pending` handler cleared sweep state (the `.fulfilled` on the study rebuilt it, but only with unique frequencies)

**Design decisions** (confirmed with user):

| Decision | Choice |
|----------|--------|
| Solve mode label | "Solved" for single, "Solved (Sweep)" for any parameter sweep |
| Bottom summary chip | Remove entirely — top label is sufficient |
| Solve mutual exclusivity | Single solve clears sweep, sweep clears single. One active solution at a time |
| Mesh per sweep point | Store `meshSnapshot` (nodes, edges, radii per element) in `ParameterPointResult` |
| Compute Fields scope | Compute for ALL sweep points at once (not just current slider position) |
| Slider interaction | Show pre-computed results when slider moves — no re-compute |
| Slider unification | `SweepVariableSelector` handles ALL swept variables including freq; `FrequencySelector` hidden during sweeps |
| Geometry sweep postprocessing | All solutions kept. Compute Fields uses per-point mesh + currents. Full postprocessing for every sweep point. |

**State model changes** (`solverSlice.ts`):

New field: `solveMode: 'single' | 'sweep' | null` — set in reducers, replaces all `frequencySweep.length > 1` checks.

Single solve: populates `multiAntennaResults`, `results`, `currentFrequency`. Clears `parameterStudy`, `frequencySweep`.

Sweep: populates `parameterStudy` (with per-point meshes). Still synthesizes `frequencySweep` for backward compat (plots). Clears `results`.

**Field data re-keying**: `fieldData[fieldId][sweepPointIndex]` for sweep mode, `fieldData[fieldId][0]` for single solve. `displayFrequencyHz` replaced by `selectedSweepPointIndex` for sweep-mode field lookup.

**`computePostprocessingWorkflow` refactor**:
- Single mode: 1 iteration, uses current mesh + `multiAntennaResults`
- Sweep mode: N iterations (one per `parameterStudy.results[]`), each using that point's `meshSnapshot` + `solverResponse.branch_currents` + frequency. Progress: `point × fields` work units.

**`ParameterPointResult` extension** (`parameterStudy.ts`):
```typescript
export interface MeshSnapshot {
  nodes: number[][];
  edges: [number, number][];
  radii: number[];
}

export interface ParameterPointResult {
  point: GridPoint;
  solverResponse: unknown;
  converged: boolean;
  meshSnapshots: MeshSnapshot[];  // One per visible element, in element order
}
```

**`parameterStudyThunks.ts`**: After remesh + before solve at each grid point, capture `elements[].mesh` → `meshSnapshots[]`.

**UI changes**:
- SolverTab Solve Control chip: uses `solveMode` — `null` → "Unsolved", `'single'` → "Solved", `'sweep'` → "Solved (Sweep)"
- Remove bottom "Sweep complete: N points" chip from SolverTab
- PostprocessingTab: `SweepVariableSelector` shown when `solveMode === 'sweep'`; `FrequencySelector` hidden when `solveMode === 'sweep'`
- Field data lookup in postprocessing: `fieldData[fieldId][selectedSweepPointIndex]` when sweep, `fieldData[fieldId][0]` when single

**Files touched**:
1. `frontend/src/types/parameterStudy.ts` — add `MeshSnapshot`, update `ParameterPointResult`
2. `frontend/src/store/parameterStudyThunks.ts` — capture mesh at each point
3. `frontend/src/store/solverSlice.ts` — add `solveMode`, refactor `computePostprocessingWorkflow`, update reducers
4. `frontend/src/features/design/SolverTab.tsx` — labels + remove bottom chip
5. `frontend/src/features/design/PostprocessingTab.tsx` — use sweep point index for field lookup
6. `frontend/src/features/postprocessing/SweepVariableSelector.tsx` — dispatch frequency update for freq-axis points
7. `frontend/src/features/postprocessing/FrequencySelector.tsx` — hide when `solveMode === 'sweep'`

### 4.12 — Deliverables (§4.11)

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `MeshSnapshot` type in `parameterStudy.ts` | Types | ✅ Done | Per-point mesh storage (nodes, edges, radii, sources, position) |
| `ParameterPointResult.meshSnapshots` field | Types | ✅ Done | Mesh captured at each sweep point |
| `parameterStudyThunks.ts` mesh capture | Redux | ✅ Done | Snapshot `elements[].mesh` per point |
| `solveMode` field in `SolverState` | Redux | ✅ Done | `'single' \| 'sweep' \| null` |
| `computePostprocessingWorkflow` refactor | Redux | ✅ Done | Iterate all sweep points with per-point mesh |
| `fieldData` keyed by sweep point index | Redux | ✅ Done | `fieldData[fieldId][pointIndex]` for sweep |
| SolverTab label refactor | Frontend | ✅ Done | "Solved @ X MHz" / "Solved (Sweep) — N points" + remove bottom chip |
| PostprocessingTab field lookup refactor | Frontend | ✅ Done | Use `selectedSweepPointIndex` for sweep mode |
| `SweepVariableSelector` freq dispatch | Frontend | ✅ Done | Update `selectedFrequencyHz` + remesh geometry when slider moves |
| `FrequencySelector` hide in sweep mode | Frontend | ✅ Done | Conditional render based on `solveMode` |

### 4.13 — Bug Fixes (post-refactor) ✅ Done

Multiple rounds of bug fixes after the unified refactor (all committed in PR #60):

| Bug | Root Cause | Fix | Commit |
|-----|-----------|-----|--------|
| `toFixed` crash on port quantities | Pydantic v2 serializes `complex` as string `"73+42j"` instead of `{real, imag}` | `@field_serializer` on `PortResult` for complex fields | `80cb6df` |
| "Solution Outdated" after sweep | `remeshElementExpressions.fulfilled` sets `isSolved=false` during nominal restore; `resultsStale` not cleared | Clear `resultsStale` in `runParameterStudy.fulfilled`; sweep-aware outdated logic in SolverTab | `4be206d` |
| Dipole accumulation / phantom sidelobes in sweep | `remeshElementExpressions` sent actual position to backend (mesh offset) but didn't update `element.position` → double offset in `convertElementToAntennaInput` | Generate mesh at origin (`center_position=[0,0,0]`), return `newPosition` from thunk, update `element.position` in fulfilled handler | `05b3f88` |
| Postprocessing outdated tag on slider move | `SweepVariableSelector` dispatches `remeshElementExpressions` for 3D visualization, which sets `isSolved=false` | Sweep-aware outdated check in Postprocessing section of SolverTab ribbon | `05b3f88` |
| Sweep point 0 not showing results | `displayFrequencyHz = sweepPointIndex`, index 0 is falsy in JS; all truthy checks skip it | Null-checks (`!= null`, `??`) instead of truthy checks in PostprocessingTab | `488d63a` |
| Sweep results lost on project reload | `solveMode`, `parameterStudy`, `parameterStudyConfig`, `selectedSweepPointIndex`, `radiationPatterns`, `selectedFrequencyHz` not persisted | Added to `getPersistableSolverState()` and `loadSolverState()` | `488d63a` |
| Sweep point 0 falsy-zero in all renderers | Same falsy-zero bug propagated to FieldRenderer, DirectivityRenderer, CurrentRenderer, VoltageRenderer, VectorRenderer, FrequencySelector, RibbonMenu | Null-checks in all 7 renderer files | `083ee64` |

### 4.14 — Design Decisions Made (§4.11)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Solve mode field | `solveMode: 'single' \| 'sweep' \| null` replaces all `frequencySweep.length > 1` checks | Single source of truth for solve type |
| Solve mutual exclusivity | Single solve clears sweep data; sweep clears single data | One active solution at a time, prevents stale state confusion |
| Mesh per sweep point | `MeshSnapshot` in `ParameterPointResult` captures nodes/edges/radii/sources/position per element | Enables per-point postprocessing with correct geometry |
| Compute Fields scope | Compute for ALL sweep points at once, not just current slider position | Pre-compute everything; slider just selects which to display |
| Slider interaction model | Show pre-computed results when slider moves — no re-compute, but re-mesh for 3D | Instant navigation; no latency |
| Slider unification | `SweepVariableSelector` handles ALL swept variables; `FrequencySelector` hidden in sweep mode | Single control surface for sweep navigation |
| Field data keying | `fieldData[fieldId][sweepPointIndex]` for sweep, `fieldData[fieldId][frequencyHz]` for single | Sweep points at same frequency but different geometry are distinguishable |
| Position convention | Mesh always generated at origin; `element.position` carries offset; applied in `convertElementToAntennaInput` | Consistent with initial creation; prevents double-offset during sweep remesh |
| Sweep state persistence | `solveMode`, `parameterStudy`, `parameterStudyConfig`, `selectedSweepPointIndex`, `radiationPatterns`, `selectedFrequencyHz` saved to project | Full session restore for sweep experiments |
| Falsy-zero handling | All `frequencyHz` and `displayFrequencyHz` checks use `!= null` / `??` instead of truthy | Sweep point index 0 is valid but falsy in JS |

### 4.15 — Known Limitations

- **CurrentRenderer/VoltageRenderer in sweep mode**: These renderers use `frequencyHz` to look up frequency sweep results by Hz comparison, but in sweep mode `frequencyHz` is the sweep point index — the Hz lookup fails. Falls back to nominal single-solve data. Proper per-sweep-point current/voltage display deferred to Phase 5.
- **`selectVariableContextNumeric` non-memoized**: Returns new object on every call, triggering react-redux warning. Cosmetic only; fix with `createSelector` when convenient.

---

## Phase 5 — Postprocessing View System: Line Plots, Smith Chart, Polar Plots, Table View ✅ COMPLETE

**Status**: ✅ COMPLETE

**Goal**: Complete the postprocessing view system so that all simulation results are consumed through user-added views in `PostprocessingTab`. Users add views explicitly (nothing shown by default). Remove all result displays from `SolverTab` — it becomes a pure control surface for solving and postprocessing. Four new view types join the existing 3D view: **Line Plot**, **Smith Chart**, **Polar Plot**, and **Table View**.

**Prerequisite**: Phase 4 complete ✅ — port quantities, parameter study, sweep mode, field data all available in Redux.

### 5.0 — Architecture & UX Principles

1. **PostprocessingTab shows NOTHING by default** — user adds views via "Add View" button or ribbon presets.
2. **SolverTab = control surface only** — contains Solve, Compute Fields, Port Quantities buttons. No plots, no result chips, no port quantities strip. `ParameterStudyPlot` is removed entirely.
3. **Build on existing view system** — `ViewConfiguration`, `addItemToView`, `PostprocessingPropertiesPanel`, tree view. New view types extend `ViewType`.
4. **Quantities are on-demand** — "quantities should only be shown when requested" by adding a view.
5. **All data sources plottable** — port quantities, current/voltage distribution, near-field components (Ex, Ey, Ez, Hx, Hy, Hz, S), far-field directivity, sweep variables.
6. **X-axis flexibility** — frequency for single-solve sweeps, swept variable for parameter studies, distance/arc-length for observation lines, theta/phi for radiation pattern cuts.
7. **Sweep visualization** — single line for 1 sweep variable; curve group (one line per secondary variable value) for 2 sweep variables.

### 5.1 — Extend ViewType & ViewConfiguration

**Updated types** in `frontend/src/types/postprocessing.ts`:

```typescript
type ViewType = '3D' | 'Line' | 'Smith' | 'Polar' | 'Table'
```

Each view type gets a discriminated item config:

```typescript
// Line Plot items
interface LinePlotItem extends BaseViewItem {
  type: 'line-plot'
  traces: PlotTrace[]
  xAxisConfig: AxisConfig
  yAxisLeftConfig: AxisConfig
  yAxisRightConfig?: AxisConfig
}

// Smith Chart items  
interface SmithChartItem extends BaseViewItem {
  type: 'smith-chart'
  dataSource: SmithDataSource  // 'frequency-sweep' | 'parameter-study'
  referenceImpedance: number
}

// Polar Plot items
interface PolarPlotItem extends BaseViewItem {
  type: 'polar-plot'
  cutPlane: 'phi' | 'theta'
  cutAngleDeg: number
  quantity: 'directivity' | 'gain' | 'E_magnitude' | 'H_magnitude'
  scale: 'linear' | 'dB'
}

// Table items
interface TableItem extends BaseViewItem {
  type: 'table'
  columns: TableColumn[]    // Which port quantities to show
}
```

### 5.2 — Unified Plot Data Model

**New file**: `frontend/src/types/plotDefinitions.ts`

```typescript
type PlotQuantity =
  // Port quantities (vs. frequency or swept variable)
  | { source: 'port'; quantity: 'impedance_real' | 'impedance_imag' | 'impedance_magnitude' | 'impedance_phase' }
  | { source: 'port'; quantity: 'reflection_coefficient_magnitude' | 'reflection_coefficient_phase' }
  | { source: 'port'; quantity: 'return_loss' | 'vswr' }
  | { source: 'port'; quantity: 'port_voltage_magnitude' | 'port_voltage_phase' }
  | { source: 'port'; quantity: 'port_current_magnitude' | 'port_current_phase' }
  // Field quantities (vs. spatial coordinate along 1D observation line, or vs. frequency)
  | { source: 'field'; fieldId: string; quantity: 'E_magnitude' | 'H_magnitude' | 'S_magnitude'
      | 'Ex' | 'Ey' | 'Ez' | 'Er' | 'Etheta' | 'Ephi'
      | 'Hx' | 'Hy' | 'Hz' | 'Hr' | 'Htheta' | 'Hphi' }
  // Far-field / radiation quantities
  | { source: 'farfield'; quantity: 'directivity' | 'gain' | 'E_theta' | 'E_phi' }
  // Current/voltage distribution along wire
  | { source: 'distribution'; quantity: 'current_magnitude' | 'current_phase'
      | 'voltage_magnitude' | 'voltage_phase' }

interface PlotTrace {
  id: string
  quantity: PlotQuantity
  label: string                        // Legend label
  color: string                        // Line color (auto-assigned or user-picked)
  lineStyle: 'solid' | 'dashed' | 'dotted'
  yAxisId: 'left' | 'right'           // Dual-axis support
}

interface AxisConfig {
  label: string
  unit: string
  scale: 'linear' | 'log' | 'dB'
}
```

### 5.3 — AddViewDialog Enhancement

**Rework** `frontend/src/features/design/dialogs/AddViewDialog.tsx`:

Current: 2-field form (name + radio: 3D / Line).  
New: 5 view type options with icons:

| View Type | Icon | Description |
|-----------|------|-------------|
| 3D View | ViewInAr | 3D antenna geometry, fields, radiation patterns |
| Line Plot | ShowChart | X-Y line plots for any quantity |
| Smith Chart | Radar (or custom) | Impedance on Smith chart |
| Polar Plot | PieChart | Radiation pattern cuts (phi/theta) |
| Table View | TableChart | Port quantities in tabular form |

On creation, the view starts empty — user adds content via ribbon buttons or presets.

### 5.4 — Quick Presets (Ribbon Menu)

**Updated ribbon section** for postprocessing (Line/Smith/Polar/Table views):

| Preset Button | Creates | Traces / Content |
|---------------|---------|-------------------|
| "Impedance" | Line Plot | Re(Z) + Im(Z) vs frequency, dual Y-axis |
| "S₁₁ (dB)" | Line Plot | Return loss (dB) vs frequency |
| "VSWR" | Line Plot | VSWR vs frequency |
| "Smith Chart" | Smith Chart view | Impedance locus, freq sweep or param study |
| "Radiation Pattern" | Polar Plot | Directivity cut at φ=0° |
| "Port Table" | Table View | Z_in, S₁₁, VSWR per frequency row |

Presets are one-click: create a new view with pre-configured traces/items. User can customize after creation via properties panel.

When a **parameter study** is active, the preset adapts:
- "Impedance" → traces use swept variable as X-axis; curve group for 2D sweeps

### 5.5 — Line Plot Rendering Engine

**New component**: `frontend/src/features/postprocessing/plots/UnifiedLinePlot.tsx`

- Reads `LinePlotItem.traces[]` and extracts data from Redux state:
  - Port quantities → from `solverSlice.frequencySweep` or `solverSlice.parameterStudy`
  - Field values → from `solverSlice.fieldData[fieldId]`
  - Current/voltage distribution → from `solverSlice.frequencySweep[].currents` / `.voltages`
  - Far-field → from `solverSlice.radiationPatterns`
- Recharts `LineChart` with:
  - Dynamic trace count (1–N lines)
  - Dual Y-axis (left + right)
  - Responsive container
  - Unit conversions: Hz→MHz, rad→deg, linear→dB
  - Tooltip showing all trace values at cursor position
- **Sweep handling**:
  - 1 sweep variable → single line per trace, X-axis = swept variable values
  - 2 sweep variables → curve group per trace, one line per secondary variable value, legend shows secondary value

**Data extraction helpers**: `frontend/src/types/plotDataExtractors.ts`
- `extractPortTraceData(trace, solverState)` → `{x, y}[]`
- `extractFieldTraceData(trace, solverState)` → `{x, y}[]`
- `extractDistributionTraceData(trace, solverState)` → `{x, y}[]`
- `extractFarfieldTraceData(trace, solverState)` → `{x, y}[]`

These are **pure functions** — easy to unit test.

### 5.6 — Smith Chart Integration

**Existing**: `SmithChart.tsx` (Phase 4) — pure SVG, `impedanceToGamma()`, 13 tests. Currently only used inside `ParameterStudyPlot`.

**Phase 5 changes**:
1. **New view type** `'Smith'` in `AddViewDialog`
2. **SmithChartItem** properties in `PostprocessingPropertiesPanel`: reference impedance Z₀, data source (frequency sweep / parameter study)
3. **SmithChartViewPanel** renders `SmithChart` with data from:
   - Frequency sweep: `frequencySweep[].portResults.impedance` → impedance locus curve
   - Parameter study: `parameterStudy.results[].portResults.impedance` → points per sweep value
4. **Interactive features** (stretch goal): hover tooltip showing Z and f at each point

### 5.7 — Polar Plot

**New component**: `frontend/src/features/postprocessing/plots/PolarPlot.tsx`

- Pure SVG polar plot (like SmithChart approach — no external library)
- Plots radiation pattern cuts: directivity/gain vs angle
- Cut planes: φ-cut (vary θ at fixed φ) or θ-cut (vary φ at fixed θ)
- Scales: linear or dB (concentric circles at dB intervals)
- Grid: concentric circles (magnitude), radial lines (angle every 30°)
- Data source: `solverSlice.radiationPatterns` keyed by frequency or sweep point

**Polar plot properties** (in `PostprocessingPropertiesPanel`):
- Cut plane selector (phi / theta)
- Cut angle (degrees)
- Quantity (directivity / gain / E_theta / E_phi)
- Scale (linear / dB)
- Frequency/sweep point (if multiple available)

### 5.8 — Table View

**New component**: `frontend/src/features/postprocessing/plots/PortQuantityTable.tsx`

- MUI `Table` showing port quantities per frequency row
- Columns (configurable): Frequency (MHz), Re(Z), Im(Z), |Z|, ∠Z, |Γ|, Return Loss (dB), VSWR
- Data source: `solverSlice.frequencySweep` or `solverSlice.parameterStudy`
- Sortable by any column
- Copy-to-clipboard button (CSV format)
- For parameter study: rows = sweep points instead of frequencies

### 5.9 — SolverTab Cleanup

**Remove from SolverTab**:
- `ParameterStudyPlot` split-panel (bottom half)
- Port quantities strip (impedance/VSWR/S₁₁ chips)
- Any inline result display

**Keep in SolverTab**:
- Solve button + sweep config
- Compute Fields button + field definition controls
- Port Quantities computation trigger button
- Status labels ("Solved @ X MHz", "Solved (Sweep) — N points")
- Parameter study dialog (configuration only, not results)

**Rationale**: SolverTab = "run computations". PostprocessingTab = "view results".

### 5.10 — PostprocessingTab Layout Update

**Remove**:
- `ParameterStudyPlot` from split-panel (bottom half of PostprocessingTab)
- Port quantities strip below warning banner
- Any auto-displayed results

**Result**: PostprocessingTab starts empty. User adds views via "Add View" or ribbon presets. Each view gets its own panel in the middle area. View selection in tree switches the active panel.

### 5.11 — Properties Panel Extensions

Extend `PostprocessingPropertiesPanel` with editors for new view types:

| View Type | Properties |
|-----------|-----------|
| Line Plot | Trace list (add/remove/reorder), per-trace: quantity picker, color, line style, Y-axis; axis configs (label, unit, scale) |
| Smith Chart | Reference impedance Z₀, data source toggle |
| Polar Plot | Cut plane, cut angle, quantity, scale |
| Table View | Column visibility toggles, sort column |

### 5.12 — Implementation Order (TDD)

| Step | Scope | Tests First |
|------|-------|-------------|
| 1 | `plotDefinitions.ts` types + `plotDataExtractors.ts` pure functions | Unit tests for all extractors |
| 2 | Extend `ViewType` enum + `ViewConfiguration` types | Type compilation check |
| 3 | `UnifiedLinePlot` component | Render tests with mock data |
| 4 | `AddViewDialog` enhancement (5 view types) | Dialog render + selection tests |
| 5 | Ribbon presets (one-click view creation) | Integration tests |
| 6 | `PolarPlot` component | SVG geometry unit tests + render tests |
| 7 | `PortQuantityTable` component | Table render + sort tests |
| 8 | Smith Chart view integration | Render with frequency sweep data |
| 9 | `PostprocessingPropertiesPanel` extensions | Property editor render tests |
| 10 | SolverTab cleanup (remove plots/chips) | Verify SolverTab renders without results |
| 11 | PostprocessingTab cleanup (remove auto-displays) | Verify empty state |

### 5.13 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `frontend/src/types/plotDefinitions.ts` | Types | ✅ | `PlotQuantity`, `PlotTrace`, `AxisConfig`, view item interfaces |
| `frontend/src/types/plotDataExtractors.ts` | Utility | ✅ | Pure data extraction functions for all trace sources |
| `frontend/src/features/postprocessing/plots/UnifiedLinePlot.tsx` | Component | ✅ | Generic multi-trace Recharts line plot |
| `frontend/src/features/postprocessing/plots/PolarPlot.tsx` | Component | ✅ | SVG polar radiation pattern plot |
| `frontend/src/features/postprocessing/plots/PortQuantityTable.tsx` | Component | ✅ | MUI table for port quantities per frequency |
| Updated `AddViewDialog.tsx` | Component | ✅ | 5 view type options with icons |
| Updated `RibbonMenu.tsx` postprocessing section | Component | ✅ | Quick preset buttons for all view types |
| Updated `PostprocessingPropertiesPanel.tsx` | Component | ✅ | Property editors for Line/Smith/Polar/Table |
| Updated `PostprocessingTab.tsx` | Component | ✅ | Remove ParameterStudyPlot, port strip; empty default state |
| Updated `SolverTab.tsx` | Component | ✅ | Remove all result displays; control surface only |
| Updated `postprocessing.ts` types | Types | ✅ | Extended `ViewType`, new item types |
| `frontend/src/types/plotDataExtractors.test.ts` | Test | ✅ | Unit tests for all data extractors |
| `frontend/src/features/postprocessing/plots/UnifiedLinePlot.test.tsx` | Test | ✅ | Render tests |
| `frontend/src/features/postprocessing/plots/PolarPlot.test.tsx` | Test | ✅ | SVG geometry + render tests |
| `frontend/src/features/postprocessing/plots/PortQuantityTable.test.tsx` | Test | ✅ | Table render + sort tests |

### 5.14 — Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PostprocessingTab default | Empty — no auto-displayed results | User explicitly adds what they want to see |
| SolverTab scope | Control surface only — no plots or result chips | Clean separation: configure & run vs. view results |
| View types | 3D (existing) + Line Plot + Smith Chart + Polar Plot + Table View | Covers all EM analysis visualization needs |
| Line Plot engine | Recharts `LineChart` with `PlotConfiguration` model | Already used in codebase; supports dual Y-axis, responsive |
| Smith Chart | Reuse existing `SmithChart.tsx` SVG; promote to standalone view | Already implemented and tested (13 tests) |
| Polar Plot | Pure SVG (same approach as SmithChart) | No external dependency; full control over rendering |
| Table View | MUI `Table` with sortable columns | MUI already in project; familiar pattern |
| Quick presets | One-click buttons in ribbon that create pre-configured views | Fast workflow — user doesn't configure from scratch |
| Data extractors | Pure functions in separate file | Testable, composable, no component coupling |
| Sweep curves | 1 variable = single line; 2 variables = curve group | Natural extension of existing ParameterStudyPlot logic |
| X-axis flexibility | Per-trace: frequency, swept variable, distance, angle | User has full control; presets provide sensible defaults |
| ParameterStudyPlot | Removed from SolverTab; functionality absorbed into Line Plot + Smith view types | Consolidation — one way to view results |
| Legacy plot wrappers | Keep ImpedancePlot/VoltagePlot/CurrentPlot as internal wrappers | Backward compatibility for saved Line-view projects |

---

## Phase 6 — Course Submission System ✅ COMPLETE

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

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `backend/common/repositories/submission_repository.py` | Repository | ✅ | DynamoDB CRUD for submissions (dual-item pattern) |
| `backend/projects/submission_routes.py` | Routes | ✅ | Submit, list, get, review (5 endpoints) |
| `backend/projects/schemas.py` additions | Schema | ✅ | SubmissionCreate, SubmissionReview, SubmissionResponse, SubmissionDetailResponse |
| `frontend/src/features/courses/MySubmissionsPage.tsx` | Page | ✅ | Student submission list with status chips |
| `frontend/src/features/courses/SubmissionsDashboard.tsx` | Page | ✅ | Instructor review dashboard with feedback dialog |
| `frontend/src/features/courses/SubmissionViewer.tsx` | Page | ✅ | Read-only submission snapshot viewer |
| `frontend/src/features/design/dialogs/SubmitDialog.tsx` | Dialog | ✅ | Confirmation dialog for project submission |
| `frontend/src/store/submissionsSlice.ts` | Redux | ✅ | Submission state management (5 thunks) |
| `frontend/src/api/submissions.ts` | API | ✅ | Submission API calls (5 functions) |
| Submit button in RibbonMenu + DesignPage | Frontend | ✅ | Course-aware submit flow from designer |
| Routes in App.tsx | Frontend | ✅ | 3 new routes: submissions dashboard, my-submissions, viewer |
| `tests/unit/test_submissions.py` | Test | ✅ | 19 tests: repository + route endpoints |
| `frontend/src/api/submissions.test.ts` | Test | ✅ | 5 API client tests |
| `frontend/src/store/submissionsSlice.test.ts` | Test | ✅ | 8 Redux slice tests |

---

## Phase 7 — Structured PDF Export ✅ COMPLETE (PR #63)

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
| `frontend/src/utils/pdfDataBuilders.ts` | Utility | Pure data extraction — cover, antenna, solver, views |
| `frontend/src/utils/pdfReportGenerator.ts` | Utility | Async multi-page PDF orchestrator |
| Updated `ExportPDFDialog.tsx` | Component | 5-section checklist, author, filename, progress |
| Updated `PostprocessingTab.tsx` | Feature | `captureView` + `generatePDFReport` wiring |
| Updated `Scene3D.tsx` | Component | `preserveDrawingBuffer: true` for WebGL capture |

**What was built**:
- 5 configurable report sections: Cover Page, Antenna Summary, Solver Config, 3D Views, Documentation
- `pdfDataBuilders.ts`: pure extraction functions (36 unit tests ✅)
- `pdfReportGenerator.ts`: async orchestrator (13 unit tests ✅)
- `ExportPDFDialog.tsx`: full rewrite with section checkboxes, author field, filename, progress bar (12 tests ✅)
- Submission metadata banner displayed when exporting from read-only student viewer
- ESLint reduced from 362 → 335 warnings (under 350 threshold)

---

## Phase 8 — Refactoring & Hardening ✅ COMPLETE (PR #64)

**Goal**: Production-quality code, comprehensive tests, security, operational robustness. Module-by-module refactoring following SOLID principles, with a commit after each module. Every module gets a README, comprehensive tests, and cleaned-up code.

**Approach**: Work module-by-module (bottom-up from `backend/common/` to feature modules). Each module step:
1. Fix all warnings, lint errors, security issues
2. Remove dead code and redundancies
3. Add missing tests
4. Add/update module README with data model, API surface, architecture notes
5. Update `.github/copilot-instructions.md` if conventions change
6. Run full CI checks → commit

---

### 8.0 — Codebase Audit Summary (Pre-Phase 8)

**Current metrics** (as of Phase 8 start):
- **Backend**: ~800 unit tests, ~100 integration tests, ~8,500 LOC across 5 services + common
- **Frontend**: ~90 test files, ~600 ESLint warnings (threshold 350), ~25,000 LOC across 13 features
- **Dead code**: 5 stub directories (solver_fem, solver_mom, solver_fdtd, fdtd_preprocessor, fdtd_postprocessor), 3 unused backend endpoints, 6 stub frontend features/APIs
- **Critical issues**: 7 security/validation gaps, 3 SOLID violations, 12 missing test areas
- **TypeScript strict mode**: OFF (`"strict": false` in tsconfig.json)

---

### 8.1 — Dead Code Removal & Codebase Cleanup

**Remove stub services and placeholder modules** that add confusion with zero functionality.

#### 8.1.1 — Backend Stubs Removal

| Directory | Contents | Action | Rationale |
|-----------|----------|--------|-----------|
| `backend/solver_fem/` | 49-line stub (health check only) | [ ] **Delete** | No solver logic; port 8004 reserved but never deployed |
| `backend/solver_mom/` | 49-line stub (health check only) | [ ] **Delete** | No solver logic; port 8006 reserved but never deployed |
| `backend/solver_fdtd/` | 49-line stub (health check only) | [ ] **Delete** | No solver logic; port 8005 reserved but never deployed |
| `backend/fdtd_preprocessor/` | Empty dir (only `__pycache__`) | [ ] **Delete** | Zero files |
| `backend/fdtd_postprocessor/` | Empty dir (only `__pycache__`) | [ ] **Delete** | Zero files |

**Document in `docs/FEM_INTEGRATION_PLAN.md`**: Add a note that stubs were removed in Phase 8; future FEM/MoM/FDTD work starts from a clean branch using the existing service template pattern.

#### 8.1.2 — Frontend Stubs Removal

| Path | Contents | Action | Rationale |
|------|----------|--------|-----------|
| `frontend/src/features/solver_fem/` | `export {}` (8 lines) | [ ] **Delete** | Empty stub |
| `frontend/src/features/solver_fdtd/` | `export {}` (8 lines) | [ ] **Delete** | Empty stub |
| `frontend/src/features/solver_mom/` | `export {}` (8 lines) | [ ] **Delete** | Empty stub |
| `frontend/src/api/solverFem.ts` | `checkHealth()` only | [ ] **Delete** | No solve functions; service doesn't exist |
| `frontend/src/api/solverMom.ts` | `checkHealth()` only | [ ] **Delete** | No solve functions; service doesn't exist |
| `frontend/src/api/solverFdtd.ts` | `checkHealth()` only | [ ] **Delete** | No solve functions; service doesn't exist |
| `frontend/src/features/design/__tests__/HelixDialog.test.tsx` | `it.todo` stub | [ ] **Delete** | Helix removed in Phase 1 |

#### 8.1.3 — Unused Backend Endpoints Analysis

| Endpoint | Service | Status | Decision |
|----------|---------|--------|----------|
| `POST /api/solve/sweep` | solver | Frontend uses multi-call via parameterStudyThunks instead | [ ] **Keep** — useful for future batch sweep; document as "available but not wired in UI" |
| `GET /api/info/materials` | solver | Never called from frontend | [ ] **Keep** — useful reference endpoint; document |
| `POST /api/estimate` | solver | Never called from frontend | [ ] **Keep** — planned for token cost preview in UI |
| `POST /api/export/vtu` | postprocessor | Frontend does VTU export client-side via `ParaViewExporter.ts` | [ ] **Evaluate** — if client-side export is sufficient, remove backend endpoint; if server-side needed for large meshes, keep |
| `POST /api/port-quantities` | postprocessor | Port quantities computed in solver; this endpoint is redundant | [ ] **Evaluate** — check if it provides extra value over solver port results |
| `GET /api/debug/*` | postprocessor | 3 debug endpoints | [ ] **Remove from production** — gate behind `DEBUG=true` env var or remove entirely |

#### 8.1.4 — Frontend Dead Code

| File | Issue | Action |
|------|-------|--------|
| `frontend/src/api/mockAuth.ts` | No imports found in codebase | [ ] **Verify** and delete if unused |
| `frontend/src/api/mockProjects.ts` | Imported in `projects.ts` for `USE_MOCK_API` fallback | [ ] **Keep** — document usage |
| `frontend/src/types/api.ts` — `PreprocessorAPI`, `SolverAPI`, `PostprocessorAPI` interfaces | Defined but never implemented or imported | [ ] **Delete** unused interfaces |
| `frontend/src/types/api.ts` — `RequestInterceptor`, `ResponseInterceptor` | Uses `any` types; not imported | [ ] **Delete** if unused; otherwise type properly |

**Commit**: `refactor: remove dead stub services and unused code`

---

### 8.2 — Module: `backend/common/` (Foundation Layer)

**Scope**: Auth, models, repositories, storage, utils — the shared foundation for all services.

#### 8.2.1 — Critical Security Fixes

| Issue | File | Line | Fix | Priority |
|-------|------|------|-----|----------|
| **`jwt.get_unverified_claims()` does not exist in PyJWT** | `cognito_provider.py` | ~219 | [ ] Replace with `jwt.decode(token, options={"verify_signature": False}, algorithms=["RS256"])` | 🔴 CRITICAL |
| **Unsafe default JWT secret** | `local_provider.py` | ~33 | [ ] Require `JWT_SECRET_KEY` env var; raise `ValueError` if missing | 🔴 CRITICAL |
| **Empty COGNITO_CLIENT_ID accepted** | `cognito_provider.py` | ~37 | [ ] Fail-fast: `if not COGNITO_CLIENT_ID: raise ValueError(...)` | 🔴 CRITICAL |
| **`get_user_by_email()` uses SCAN (O(n))** | `user_repository.py` | ~145 | [ ] Add Email-GSI to DynamoDB table; query GSI instead of scan | 🔴 CRITICAL (perf) |

#### 8.2.2 — Repository Layer Refactoring

**Problem**: DynamoDB table property duplicated across 4 repository classes (`dynamodb_repository.py`, `folder_repository.py`, `enrollment_repository.py`, `submission_repository.py`).

**Fix — Extract `DynamoDBMixin`**:
```python
# backend/common/repositories/dynamodb_mixin.py
class DynamoDBTableMixin:
    """Lazy-init DynamoDB table access. Subclasses set `table_name`."""
    table_name: str
    _table = None
    _dynamodb_resource = None

    @property
    def table(self):
        if self._table is None:
            endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
            dynamo = self._dynamodb_resource or (
                boto3.resource("dynamodb", endpoint_url=endpoint)
                if endpoint else boto3.resource("dynamodb")
            )
            self._table = dynamo.Table(self.table_name)
        return self._table
```

- [ ] Create `DynamoDBTableMixin` base class
- [ ] Refactor all 4 repositories to use mixin
- [ ] Add `@abstractmethod` decorators to ALL methods in `base.py` `UserRepository` and `ProjectRepository` ABCs
- [ ] Add missing `@abstractmethod` decorators — currently some methods lack the decorator, violating the ABC contract

**Additional repository fixes**:
- [ ] `user_repository.py`: Reduce `_ensure_table()` logging from 20+ `logger.info()` to 3 key messages (start, result, error)
- [ ] `user_repository.py`: Remove or formalize deprecated `update_user_approval()` method
- [ ] `dynamodb_repository.py`: `list_all_projects_in_folder()` uses SCAN — add GSI `(FolderId, CreatedAt)` for efficient query; document as "acceptable for small course folders" if GSI deferred
- [ ] `submission_repository.py`: Ensure float-to-Decimal conversion is comprehensive for all numeric fields in frozen results

#### 8.2.3 — Auth Module Hardening

- [ ] `token_dependency.py`: Add `exc_info=True` to exception logging in `_log_usage()` so stack traces are captured
- [ ] `cognito_provider.py`: Add `COGNITO_USER_POOL_ID` validation at init (fail-fast)
- [ ] `cognito_provider.py`: Fix username fallback (`user_{id[:8]}`) — add warning log when email is unknown
- [ ] `local_provider.py`: Add JWT token expiry validation (check `exp` claim in `validate_token()`)
- [ ] `dependencies.py`: Document `time.monotonic()` cache behavior after system sleep

#### 8.2.4 — Serialization & Utils Hardening

- [ ] `serialization.py`: Add `math.isfinite()` check in `serialize_complex()` — raise `ValueError` for NaN/Inf
- [ ] `serialization.py`: Add `try-except` for `deserialize_numpy()` reshape failures
- [ ] `geometry.py` `Source.serialize_complex()`: Add NaN/Inf validation
- [ ] `utils/__init__.py`: Add missing exports (`get_expression_variables`, `detect_circular_dependencies`) to `__all__`
- [ ] `expressions.py`: Improve division-by-zero error message to include operands

#### 8.2.5 — Model Validation Strengthening

| Model | Field | Fix |
|-------|-------|-----|
| `VariableContext` | `variables` | [ ] Add `max_length=100` — prevent unbounded variable lists |
| `PortResult` | `return_loss` | [ ] Add `Field(ge=-200, le=0)` — dB range bounds |
| `PortResult` | `input_power` | [ ] Add `Field(ge=0)` — no negative power |
| `AntennaElement` | `parameters` | [ ] Document that `Dict[str, Any]` is intentionally unconstrained (type-specific configs vary) |
| `SweepResultEnvelope` | `frequencies` | [ ] Add validator for ascending order and uniqueness |

#### 8.2.6 — Tests to Add

| Test File | Coverage Target | Tests |
|-----------|----------------|-------|
| `tests/unit/test_cognito_provider.py` | [ ] NEW | JWT decode fix, env var validation, username fallback, JWKS verification edge cases |
| `tests/unit/test_local_provider.py` | [ ] NEW | Missing JWT_SECRET raises, token expiry, bcrypt edge cases |
| `tests/unit/test_dynamodb_mixin.py` | [ ] NEW | Table property init, endpoint URL handling, resource caching |
| `tests/unit/test_serialization.py` | [ ] NEW or EXPAND | NaN/Inf serialization, numpy reshape failures, complex roundtrip |
| `tests/unit/test_user_repository.py` | [ ] EXPAND | Email lookup performance (mock scan vs query), token deduction race conditions |

#### 8.2.7 — README

- [ ] Create `backend/common/README.md` — Document:
  - Module architecture diagram (auth → models → repositories → storage → utils)
  - Auth strategy pattern (USE_COGNITO env var, provider ABC, factory)
  - Repository pattern (DynamoDB single-table, GSIs, key schema)
  - Data model: UserIdentity, AntennaElement, Variable, PortResult, SweepResultEnvelope
  - Storage abstraction (S3/MinIO/local)
  - Expression evaluator security model (AST whitelist, no eval)
  - Environment variables reference table

**Commit**: `refactor(common): security fixes, repository mixin, model validation, tests`

---

### 8.3 — Module: `backend/preprocessor/` (Geometry Engine)

#### 8.3.1 — Validation & Security

- [ ] `builders.py` L312: Validate complex amplitude dict — ensure `"real"` and `"imag"` are numeric (`isinstance(v, (int, float))`)
- [ ] `builders.py`: Add boundary check for feed node indices when `segments=0` (gap dipole edge case)
- [ ] `schemas.py`: Add `Field` constraints to all request schemas:
  - `CustomRequest.nodes`: `max_length=5000` (prevent memory exhaustion)
  - `CustomRequest.edges`: `max_length=10000`
  - All `radius` fields: `Field(gt=0, le=1.0)` (max 1m wire radius — reasonable physics bound)
  - All `segments` fields: `Field(ge=1, le=1000)`
  - `DipoleRequest.length`: `Field(gt=0, le=100)` (100m max)
  - `LoopRequest.radius`: `Field(gt=0, le=50)` (50m max)
- [ ] `builders.py` L536: Add `np.isnan(normal_mag)` check for loop normal vector
- [ ] `builders.py` L258: Validate gap < 2πr for loop antenna (gap angle overflow)

#### 8.3.2 — SOLID Refactoring

- [ ] `builders.py` `create_custom()` (~150 lines): Extract helper functions:
  - `_validate_custom_nodes(nodes)` — ID uniqueness, finite coords, positive radius
  - `_validate_custom_edges(edges, node_ids)` — reference validity, no self-loops, no duplicates
  - `_reindex_nodes_and_edges(nodes, edges)` — contiguous 1-based re-indexing
- [ ] `main.py`: Standardize error handling — replace bare `except Exception` with specific catches:
  - `ValueError` → 422 (validation error with detail)
  - `np.linalg.LinAlgError` → 500 (numerical error with user message)
  - Other → 500 (unexpected, log full traceback)
- [ ] `main.py`: Consider extracting `_convert_source()` and `_convert_lumped_elements()` to a shared utility (used in every endpoint handler)

#### 8.3.3 — Tests to Add

| Test | Scope |
|------|-------|
| [ ] `tests/unit/test_preprocessor_api.py` | FastAPI route tests: each endpoint with valid/invalid input, auth, error responses |
| [ ] Expand `test_custom_builder.py` | Edge cases: max node count, zero-length edges, duplicate IDs after reindex |
| [ ] `test_builders_amplitude.py` | Complex amplitude dict validation (missing keys, non-numeric values, NaN) |

#### 8.3.4 — README

- [ ] Create `backend/preprocessor/README.md` — Document:
  - Supported antenna types (dipole, loop, rod, custom) with parameter tables
  - Mesh data model: nodes (1-based), edges, source_edges, element mapping
  - API endpoints with request/response schemas
  - Builder architecture: `create_X()` → `X_to_mesh()` pattern
  - Validation rules and error codes
  - Expression integration (variable_context field)

**Commit**: `refactor(preprocessor): input validation, builder extraction, API tests`

---

### 8.4 — Module: `backend/solver/` (PEEC Engine)

#### 8.4.1 — Critical Fixes

- [ ] `main.py` L165: **Token deduction race condition** — Replace check-then-deduct with atomic DynamoDB `UpdateExpression` using `ConditionExpression`:
  ```python
  # Atomic: deduct only if balance >= cost
  table.update_item(
      Key=...,
      UpdateExpression="SET TokenBalance = TokenBalance - :cost",
      ConditionExpression="TokenBalance >= :cost",
      ExpressionAttributeValues={":cost": Decimal(str(cost))}
  )
  ```
- [ ] `solver.py`: Add frequency array validation — reject NaN, Inf, negative, zero frequencies:
  ```python
  for freq in frequencies:
      if not (np.isfinite(freq) and freq > 0):
          raise ValueError(f"Invalid frequency: {freq}")
  ```
- [ ] `solver.py`: Add zero-length edge detection — check `edge[0] != edge[1]` before geometry computation
- [ ] `main.py` L130: Add upper bound for node count (`max_nodes=2000`) and edge count (`max_edges=5000`) to prevent memory exhaustion
- [ ] `system.py`: Add matrix conditioning check before `np.linalg.solve()` — warn if condition number > 1e12

#### 8.4.2 — Numerical Robustness

- [ ] `solver.py` L350: Add retardation phase warning — if `max(beta * dist) > 2π`, log warning about high-frequency regime
- [ ] `resistance.py` L290: Guard skin effect calculation — skip if `frequency <= 0` or `omega == 0`
- [ ] `inductance.py` L155: Validate Gauss quadrature order against available data in `GAUSS_LEGENDRE_DATA`; raise clear error if not found
- [ ] `system.py`: Add self-inductance bounds check — warn if `wire_radius > edge_length` (numerical instability regime)

#### 8.4.3 — SOLID Refactoring

- [ ] `solver.py` `solve_peec_frequency_sweep()` (~250 lines): Extract into:
  - `_build_topology(antennas, ...)` — topology assembly
  - `_compute_impedance_at_frequency(freq, topology, ...)` — single-frequency solve
  - `_extract_port_results(currents, topology, ...)` — post-processing
- [ ] `main.py`: Standardize error responses (same as preprocessor: ValueError→422, LinAlgError→500)
- [ ] Remove/fix `import services.estimation` if the module path is wrong

#### 8.4.4 — Tests to Add

| Test | Scope |
|------|-------|
| [ ] `tests/unit/test_solver_core.py` | Unit tests for `solve_peec_system()` with known small matrices (2-node, 3-node) |
| [ ] `tests/unit/test_solver_validation.py` | Invalid input: NaN frequencies, zero-length edges, too many nodes, singular matrices |
| [ ] `tests/unit/test_solver_token_atomic.py` | Atomic token deduction: concurrent requests, insufficient balance |
| [ ] `tests/unit/test_potential_nodal.py` | Nodal potential assembly with known geometries |
| [ ] Expand `test_solver_frequency.py` | Edge cases: single frequency, frequency=0, very high frequency (retardation regime) |

#### 8.4.5 — README

- [ ] Create `backend/solver/README.md` — Document:
  - PEEC method overview (partial element equivalent circuit)
  - MNA system assembly: incidence matrix, L/R/P matrices
  - Retardation model and limitations
  - Skin effect model
  - Multi-antenna coupling
  - Gauss quadrature integration orders
  - API endpoints with request/response schemas
  - Token cost model
  - Known numerical limitations (frequency regime, mesh density requirements)

**Commit**: `refactor(solver): atomic tokens, frequency validation, numerical guards, tests`

---

### 8.5 — Module: `backend/postprocessor/` (Field Engine)

#### 8.5.1 — Validation & Security

- [ ] `main.py` L130: Move observation point count check BEFORE array parsing (prevent memory allocation before validation)
- [ ] `main.py` L145: Add validation: `len(branch_currents[0]) == len(edges)` — mismatch crashes silently
- [ ] `field.py` L77: Cap dynamic segment count: `n_segments = min(max(5, int(...)), 100)` — prevent 1000+ segments per edge
- [ ] `field.py` L128: Scale finite-difference step `h` by observation point distance, not just wavenumber
- [ ] `field.py`: Add NaN check on E_theta/E_phi before Poynting vector computation

#### 8.5.2 — SOLID Refactoring

- [ ] `main.py` `compute_near_field()`: Extract:
  - `_validate_field_request(request)` — input checks
  - `_parse_field_inputs(request)` — array conversion
  - `_assemble_field_response(E, H, S, obs_points)` — response building
- [ ] `field.py`: Evaluate deprecated `compute_electric_field_from_potential()` — if not called from any endpoint, remove or mark with `@deprecated` docstring
- [ ] `pattern.py`: Accept `Z_0` as parameter (not module-level constant) for testability:
  ```python
  def compute_radiation_intensity(E_theta, E_phi, z0=Z_0):
  ```
- [ ] Gate debug endpoints behind `DEBUG` env var:
  ```python
  if settings.debug:
      app.include_router(debug_router)
  ```

#### 8.5.3 — Tests to Add

| Test | Scope |
|------|-------|
| [ ] `tests/unit/test_postprocessor_api.py` | FastAPI route tests: valid/invalid field requests, observation point limits |
| [ ] `tests/unit/test_field_edge_cases.py` | NaN inputs, zero-distance singularity, extreme frequencies |
| [ ] `tests/unit/test_field_segmentation.py` | Dynamic segment count capping, memory bounds |
| [ ] Expand `test_far_field.py` | Hertzian dipole reference at multiple frequencies |

#### 8.5.4 — README

- [ ] Create `backend/postprocessor/README.md` — Document:
  - Near-field computation method (vector potential integral, finite differences)
  - Far-field approximation (threshold criteria, segment adaptive refinement)
  - Radiation pattern: directivity, gain, pattern cuts
  - API endpoints with request/response schemas
  - Observation point limits and performance characteristics
  - Known limitations (singularity handling, high-frequency regime)

**Commit**: `refactor(postprocessor): validation ordering, field guards, API tests`

---

### 8.6 — Module: `backend/projects/` (Persistence Layer)

#### 8.6.1 — Security Fixes

- [ ] `documentation_service.py` L192: Add file extension whitelist to `IMAGE_KEY_PATTERN`:
  ```python
  ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'}
  ```
- [ ] `folder_routes.py` L230: Add authorization check before deep-copy — verify `_can_access_project(source_project, user)`
- [ ] `folder_routes.py`: Add folder cycle detection on move (`_check_folder_cycle()`) — prevent A→B→A loops
- [ ] `main.py`: Wrap S3 storage calls with `try-except` — handle `BotoClientError` gracefully instead of crashing
- [ ] `folder_routes.py` L235: Add null check after `get_folder()` before deep-copy operations

#### 8.6.2 — Validation Strengthening

- [ ] `schemas.py`: Add constraints to all string/list fields:
  ```python
  class ProjectCreate(BaseModel):
      name: str = Field(..., min_length=1, max_length=200)
      description: str = Field(default="", max_length=5000)
  ```
- [ ] `schemas.py`: Add constraints to submission schemas:
  ```python
  class SubmissionCreate(BaseModel):
      project_id: str = Field(..., min_length=1, max_length=100)
  ```
- [ ] `results_service.py`: Replace magic strings with Enum:
  ```python
  class ResultKeyType(str, Enum):
      SOLVER = "solver_results"
      PATTERN = "radiation_pattern"
      FIELD = "field_data"
  ```

#### 8.6.3 — SOLID Refactoring

- [ ] `documentation_service.py`: Ensure S3 client is injected via constructor (not created internally) — already partially done, verify full DI
- [ ] `results_service.py`: Same DI pattern for S3 client
- [ ] `main.py`: Remove unused import `backend.auth.schemas` (if confirmed unused)

#### 8.6.4 — Tests to Add

| Test | Scope |
|------|-------|
| [ ] `tests/unit/test_projects_api.py` | CRUD endpoint tests: create, read, update, delete with auth |
| [ ] `tests/unit/test_projects_authorization.py` | Authorization edge cases: deep-copy without access, folder cycle, cross-user access |
| [ ] `tests/unit/test_documentation_security.py` | File extension validation, image key pattern, S3 error handling |
| [ ] Expand `test_submissions.py` | Concurrent submission, immutability verification, cross-course access |

#### 8.6.5 — README

- [ ] Create `backend/projects/README.md` — Document:
  - DynamoDB single-table design: PK/SK patterns, GSIs
  - Project data model: 4 JSON blob columns (design_state, simulation_config, simulation_results, ui_state)
  - Folder/course hierarchy model
  - Submission lifecycle (submitted → reviewed → returned)
  - Documentation service: S3 image storage, key patterns, allowed extensions
  - Results service: S3 result storage, key types, extraction/storage flow
  - API endpoints with request/response schemas
  - Authorization model (owner, maintainer, admin)

**Commit**: `refactor(projects): security fixes, schema validation, authorization hardening`

---

### 8.7 — Module: `backend/auth/` (Standalone Auth)

#### 8.7.1 — Security Fixes

- [ ] `main.py` L60: **Prevent username enumeration** — Return generic error messages:
  ```python
  except ValueError:
      raise HTTPException(400, detail="Registration failed. Please check your input.")
  ```
- [ ] `main.py` L95: **Prevent login enumeration** — Return generic error:
  ```python
  except ValueError:
      raise HTTPException(401, detail="Invalid credentials.")
  ```
- [ ] `main.py` L50: Sanitize user input before logging (strip email from error messages)

#### 8.7.2 — Documentation

- [ ] Add docstring to `main.py` clarifying this service is **standalone/Docker mode only** — in AWS, auth endpoints are re-mounted in Projects Lambda
- [ ] Create `backend/auth/README.md` — Document:
  - When this service is used (standalone mode, `USE_COGNITO=false`)
  - Endpoints: register, login, profile
  - Relationship to `backend/common/auth/` (this is a thin wrapper)
  - JWT token flow (HS256 local vs RS256 Cognito)

**Commit**: `refactor(auth): prevent user enumeration, documentation`

---

### 8.8 — Module: `frontend/src/store/` (State Management)

#### 8.8.1 — Fix Known Issues

- [ ] `variablesSlice.ts`: Memoize `selectVariableContextNumeric` with `createSelector`:
  ```typescript
  import { createSelector } from '@reduxjs/toolkit'
  export const selectVariableContextNumeric = createSelector(
    (state: RootState) => state.variables.variables,
    (vars) => evaluateVariableContextNumeric(vars)
  )
  ```
- [ ] `submissionsSlice.ts`: Add `.addCase(thunk.rejected, ...)` handlers to ALL 5 thunks — currently fails silently
- [ ] `authSlice.ts`: Clear `error` state on `loginAsync.fulfilled` and `registerAsync.fulfilled`
- [ ] `projectsSlice.ts`: Document dual-name fields (`items`/`projects`, `currentProject`/`selectedProject`) — add deprecation comments for legacy aliases

#### 8.8.2 — Consolidate Utilities

- [ ] `solverSlice.ts` L66-100: Move `parseComplex()`, `parseComplexArray()` to `frontend/src/utils/complexNumber.ts` — currently duplicated between `solverSlice.ts` and `solverHelpers.ts`
- [ ] Create canonical complex number utilities:
  ```typescript
  // frontend/src/utils/complexNumber.ts
  export function parseComplex(val: unknown): { real: number; imag: number }
  export function parseComplexArray(arr: unknown[]): { real: number; imag: number }[]
  export function complexToString(c: { real: number; imag: number }): string
  ```

#### 8.8.3 — Tests to Add

| Test File | Scope |
|-----------|-------|
| [ ] `frontend/src/store/__tests__/authSlice.test.ts` | **NEW** — All 5 thunks (login, register, getCurrentUser, refreshToken, validateSession), error clearing, loading states |
| [ ] `frontend/src/store/__tests__/uiSlice.test.ts` | **NEW** — Theme toggle, notification add/remove, layout state changes |
| [ ] `frontend/src/store/__tests__/submissionsSlice.test.ts` | **EXPAND** — Add rejected thunk tests, verify error state populated |
| [ ] `frontend/src/store/__tests__/variablesSlice.test.ts` | **EXPAND** — Test memoized selector, variable CRUD actions |

**Commit**: `refactor(store): memoize selectors, error handling, complex utils, tests`

---

### 8.9 — Module: `frontend/src/api/` (API Client Layer)

#### 8.9.1 — Cleanup

- [ ] Delete `mockAuth.ts` if confirmed unused (no imports found in codebase)
- [ ] `postprocessor.ts`: Standardize error handling — either wrap in custom `ApiError` or let errors bubble to thunk `rejectWithValue` (don't do both)
- [ ] `client.ts`: Review token refresh interceptor for edge cases:
  - Concurrent 401s during refresh
  - Refresh token also expired
  - Network error during refresh

#### 8.9.2 — Type Safety

- [ ] `api.ts`: Delete unused interfaces (`PreprocessorAPI`, `SolverAPI`, `PostprocessorAPI`, `RequestInterceptor`, `ResponseInterceptor`) or implement them
- [ ] Add proper return types to all API functions (currently some return `any` from Axios)

**Commit**: `refactor(api): cleanup unused code, standardize error handling`

---

### 8.10 — Module: `frontend/src/types/` (Type Definitions)

- [ ] Remove unused API type interfaces (from 8.9.2)
- [ ] Audit all `any` types in type definition files — replace with proper types where possible
- [ ] Ensure all exported types are used (search for orphans)
- [ ] Verify `circuitTypes.ts` `circuitToBackend()` / `backendToCircuit()` roundtrip correctness

**Commit**: `refactor(types): remove unused types, improve type safety`

---

### 8.11 — Module: `frontend/src/features/` (UI Components)

#### 8.11.1 — Missing Tests (Critical Gaps)

| Feature | Test Status | Action |
|---------|-------------|--------|
| `features/admin/` | ❌ NO TESTS | [ ] Add AdminDashboard render tests, user management tests |
| `features/courses/` | ❌ NO TESTS | [ ] Add CourseLibrary render tests, enrollment tests |
| `features/auth/` | ❌ NO COMPONENT TESTS | [ ] Add LoginPage, RegisterPage render + form submission tests |
| `features/home/` | ❌ NO TESTS | [ ] Add HomePage render test (simple) |
| `features/design/__tests__/AddFieldDialog.test.tsx` | 2 `it.skip` | [ ] Implement or remove skipped tests |
| `features/design/__tests__/FrequencyInputDialog.test.tsx` | 3 `it.skip` | [ ] Implement or remove skipped tests |

#### 8.11.2 — Error Boundaries

- [ ] Verify existing `ErrorBoundary.tsx` usage — wrap around:
  - 3D scene (`Scene3D`, `WirePreview3D`)
  - Plot panels (`UnifiedLinePlot`, `PolarPlot`, `SmithChart`)
  - Circuit editor (`CircuitEditor`)
- [ ] Add error boundary fallback UI with "Something went wrong" + retry button

#### 8.11.3 — ESLint Warning Reduction

Current: ~335 warnings (threshold 350). Target: <200 warnings.

- [ ] Fix `@typescript-eslint/no-unused-vars` — most common warning (~100+ instances)
- [ ] Fix `@typescript-eslint/no-explicit-any` — replace `any` with proper types
- [ ] Fix `no-empty-pattern` in test files
- [ ] Remove unused `eslint-disable` directives
- [ ] Lower ESLint `--max-warnings` threshold to 200 after fixes

**Commit**: `refactor(features): add missing tests, error boundaries, ESLint cleanup`

---

### 8.12 — Cross-Cutting: Error Response Standardization

#### 8.12.1 — Backend Error Model

Create a standardized error response used by ALL services:

```python
# backend/common/models/errors.py
class ErrorResponse(BaseModel):
    detail: str                    # Human-readable message
    code: str                      # Machine-readable: "VALIDATION_ERROR", "INSUFFICIENT_TOKENS", etc.
    field: str | None = None       # Optional: which field caused the error
    correlation_id: str | None = None  # Request tracing ID
```

- [ ] Create `backend/common/models/errors.py`
- [ ] Create `backend/common/middleware/error_handler.py` — global exception handler middleware:
  - `ValueError` → 422 with `code="VALIDATION_ERROR"`
  - `np.linalg.LinAlgError` → 500 with `code="NUMERICAL_ERROR"`
  - `HTTPException` → pass through
  - Other → 500 with `code="INTERNAL_ERROR"`, log full traceback
- [ ] Apply middleware to all 5 services
- [ ] Add correlation ID generation (UUID per request) via middleware

#### 8.12.2 — Frontend Error Handling

- [ ] Create `frontend/src/utils/apiError.ts`:
  ```typescript
  interface ApiError {
    detail: string
    code: string
    field?: string
    correlationId?: string
  }
  function parseApiError(error: unknown): ApiError
  ```
- [ ] Update all `rejectWithValue` calls in thunks to use `parseApiError()`
- [ ] Display `correlationId` in error snackbars (helps debugging)

**Commit**: `feat(errors): standardized error responses with correlation IDs`

---

### 8.13 — Cross-Cutting: Structured Logging

- [ ] `backend/common/utils/logging.py` — JSON log formatter:
  ```python
  class JsonFormatter(logging.Formatter):
      def format(self, record):
          return json.dumps({
              "timestamp": ...,
              "level": record.levelname,
              "service": SERVICE_NAME,
              "correlation_id": getattr(record, "correlation_id", None),
              "message": record.getMessage(),
              "user_id": getattr(record, "user_id", None),
          })
  ```
- [ ] Apply to all services via shared config function
- [ ] Log simulation requests with: user_id, duration, token cost, frequency count, node count
- [ ] Redact sensitive fields (passwords, tokens) in log output

**Commit**: `feat(logging): structured JSON logging with correlation IDs`

---

### 8.14 — Cross-Cutting: Request Size, Rate Limiting & DDoS Hardening

> **CRITICAL CONSTRAINT**: This is a **zero-budget project**. AWS costs must stay near $0 under normal use and must NOT explode under attack. Every defense must work in both AWS Lambda and local/Docker modes without breaking either deployment target.

#### 8.14.1 — Request Size Limits

- [ ] Create `backend/common/middleware/request_size.py`:
  ```python
  class RequestSizeMiddleware:
      def __init__(self, app, max_body_size: int = 10 * 1024 * 1024):  # 10MB
          ...
  ```
- [ ] Apply to all services — different limits per service:
  - Preprocessor: 10MB (custom geometry can be large)
  - Solver: 50MB (multi-antenna with many edges)
  - Postprocessor: 10MB
  - Projects: 5MB (project JSON blobs)
- [ ] Reject oversized requests BEFORE reading body into memory (check `Content-Length` header first)

#### 8.14.2 — Rate Limiting (Application Layer)

- [ ] For standalone/Docker: Create `backend/common/middleware/rate_limit.py` using in-memory token bucket:
  - Simulation endpoints: 10 requests/minute per user
  - CRUD endpoints: 60 requests/minute per user
  - Auth endpoints: 5 requests/minute per IP (brute-force protection)
  - Return `429 Too Many Requests` with `Retry-After` header
- [ ] For AWS Lambda: Rate limiting middleware is **skipped** (handled by API Gateway throttling + Lambda concurrency caps — see §8.14a)
- [ ] Middleware auto-detects mode via `IS_LAMBDA` env var — no code change needed between deployments

#### 8.14.3 — Backend Computational Limits (Both Modes)

Prevent single requests from consuming excessive CPU/memory regardless of DDoS protection:

- [ ] **Solver**: Cap `max_nodes=2000`, `max_edges=5000`, `max_frequencies=500` in request schemas
- [ ] **Solver**: Add per-request timeout — `asyncio.wait_for(solve_task, timeout=120)` (2 min max per solve)
- [ ] **Postprocessor**: Cap `max_observation_points=50000` (validated before array creation)
- [ ] **Postprocessor**: Cap `n_segments` per edge to 100 (prevents 1000+ segments from high freq × long edge)
- [ ] **Preprocessor**: Cap `CustomRequest.nodes` at 5000, `CustomRequest.edges` at 10000
- [ ] **Projects**: Cap `design_state` + `simulation_results` JSON blob sizes (reject if > 2MB each)
- [ ] **All services**: FastAPI `Request.body()` already buffers; add explicit `Content-Length` cap middleware so Lambda doesn't process huge payloads

**Commit**: `feat(middleware): request size limits, rate limiting, computational caps`

---

### 8.14a — AWS DDoS Protection & Cost Explosion Prevention

> **Design principle**: Defense in depth using **only free-tier mechanisms** — Lambda concurrency limits as the primary hard stop, application-layer rate limiting in Python, API Gateway throttling, CloudFront caching, and billing alarms as safety net. **No WAF** (costs ~$8+/month with no free tier — removed from scope).

#### 8.14a.1 — Lambda Concurrency Limits (Hard Cost Cap)

Lambda charges per invocation + duration. A DDoS that triggers millions of Lambdas = huge bill.

- [ ] **Terraform**: Set `reserved_concurrent_executions` on each Lambda:
  ```hcl
  # Per-service concurrency caps
  preprocessor  = 5    # ~5 concurrent mesh generations is plenty
  solver        = 10   # Most expensive; 10 concurrent solves max
  postprocessor = 5    # Field computation
  projects      = 10   # CRUD (higher traffic, cheaper per call)
  ```
- [ ] Total account concurrency effectively capped at ~30 Lambdas
- [ ] Excess requests get throttled (429) — NOT queued, NOT billed
- [ ] **Local/Docker**: Not applicable — Docker containers have no concurrency billing

#### 8.14a.2 — AWS Billing Alarms & Budget

- [ ] **Terraform**: Create `aws_budgets_budget` resource:
  ```hcl
  resource "aws_budgets_budget" "zero_budget_alert" {
    budget_type  = "COST"
    limit_amount = "5.00"     # $5 USD total monthly cap
    limit_unit   = "USD"
    time_unit    = "MONTHLY"

    notification {
      comparison_operator = "GREATER_THAN"
      threshold           = 80   # Alert at $4
      threshold_type      = "PERCENTAGE"
      notification_type   = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
    notification {
      comparison_operator = "GREATER_THAN"
      threshold           = 100  # Alert at $5
      threshold_type      = "PERCENTAGE"
      notification_type   = "ACTUAL"
      subscriber_email_addresses = [var.alert_email]
    }
  }
  ```
- [ ] **CloudWatch alarm**: Lambda invocation count > 10,000/day → SNS email alert
- [ ] **CloudWatch alarm**: DynamoDB consumed read/write capacity > 1000 RCU/WCU → alert
- [ ] **S3 lifecycle rule**: Auto-delete objects in `simulation-results/` bucket older than 90 days (prevent storage creep)

#### 8.14a.3 — DynamoDB Cost Protection

- [ ] Ensure DynamoDB tables use **On-Demand** pricing (pay-per-request, no provisioned throughput to overspend)
- [ ] Set DynamoDB table-level throttle via `aws_appautoscaling_target` if needed (max 25 WCU/25 RCU in free tier)
- [ ] Avoid DynamoDB SCAN operations in hot paths (already addressed in §8.2.1 — GSI for email lookup)
- [ ] Add `Condition` to all DynamoDB writes that could be triggered by unauthenticated requests (prevent write amplification)

#### 8.14a.4 — CloudFront & S3 Cost Protection

- [ ] CloudFront: Enable **Standard** caching (static assets cached at edge — reduces origin requests)
- [ ] S3: Do NOT enable Transfer Acceleration (costs extra)
- [ ] S3: Set bucket lifecycle: delete incomplete multipart uploads after 1 day
- [ ] CloudFront: Set `price_class = "PriceClass_100"` (cheapest — US/EU edges only)

#### 8.14a.5 — Cognito Cost Protection

- [ ] Cognito free tier: 50,000 MAU. Set alert if approaching 40,000.
- [ ] Disable self-service account creation if not needed (admin-only user provisioning reduces abuse)
- [ ] Rate-limit `/api/auth/register` to 2 requests/minute per IP (prevent mass account creation)

#### 8.14a.6 — Emergency Kill Switch

- [ ] Create `dev_tools/emergency_disable.ps1`:
  ```powershell
  # Instantly disable all Lambda function URLs (stops all traffic)
  # Sets reserved_concurrent_executions = 0 for all Lambdas
  param([string]$Profile = "antenna-staging")
  $lambdas = @("preprocessor","solver","postprocessor","projects")
  foreach ($fn in $lambdas) {
      aws lambda put-function-concurrency `
          --function-name "antenna-simulator-$fn-staging" `
          --reserved-concurrent-executions 0 `
          --profile $Profile
  }
  Write-Host "ALL LAMBDAS DISABLED. Run restore script to re-enable."
  ```
- [ ] Create `dev_tools/emergency_restore.ps1` — sets concurrency back to normal values
- [ ] Document in root `README.md` under "Emergency Procedures"

**Commit**: `feat(security): AWS DDoS protection, cost caps, billing alarms, kill switch`

---

### 8.14c — AWS Resource Tagging for Billing Separation

> If multiple projects share the same AWS account, consistent tagging is essential to distinguish costs per project in Cost Explorer and billing reports.

#### 8.14c.1 — Current State (Already Good)

The Terraform setup already applies `default_tags` via the AWS provider:

```hcl
# terraform/environments/staging/main.tf — already in place
default_tags {
  tags = {
    Project     = "antenna-simulator"
    Environment = "staging"
    ManagedBy   = "terraform"
    Repository  = "github.com/baumgpaul/AntennaEducator"
  }
}
```

Every module also passes `Component` and `Service` tags via `var.tags`. This means **all resources are already tagged** with project identity automatically.

#### 8.14c.2 — Add `CostCenter` Tag for Multi-Project Billing

- [ ] Add `CostCenter = "antenna-edu"` to `default_tags` in both providers (`eu-west-1` and `us-east-1`):
  ```hcl
  default_tags {
    tags = {
      Project     = "antenna-simulator"
      Environment = "staging"
      ManagedBy   = "terraform"
      Repository  = "github.com/baumgpaul/AntennaEducator"
      CostCenter  = "antenna-edu"   # <-- NEW: billing separation
    }
  }
  ```
- [ ] **Enable CostCenter as a cost allocation tag** in AWS Billing Console:
  - Billing → Cost allocation tags → Activate `CostCenter` tag
  - After activation, Cost Explorer can filter/group by `CostCenter = "antenna-edu"`
  - Other projects on the same account use a different `CostCenter` value

#### 8.14c.3 — Fix Cognito Module Tag Inconsistency

The `modules/cognito/main.tf` and `modules/cognito/lambda-auto-confirm.tf` **hardcode** their own tags instead of using `merge(var.tags, ...)`, silently dropping the `Component = "authentication"` tag passed from staging:

```hcl
# CURRENT (broken — ignores var.tags):
tags = {
  Name        = "antenna-simulator-${var.environment}"
  Environment = var.environment
  Project     = "antenna-simulator"
  ManagedBy   = "terraform"
}

# FIX — use same pattern as all other modules:
tags = merge(var.tags, {
  Name = "antenna-simulator-${var.environment}"
})
```

- [ ] Fix `modules/cognito/main.tf` — `aws_cognito_user_pool` tags
- [ ] Fix `modules/cognito/lambda-auto-confirm.tf` — `aws_lambda_function` + `aws_iam_role` tags
- [ ] After fix, the `Component = "authentication"` tag flows through correctly

#### 8.14c.4 — Fix Bootstrap Missing `Repository` Tag

- [ ] Add `Repository = "github.com/baumgpaul/AntennaEducator"` to `terraform/bootstrap/main.tf` `default_tags`

#### 8.14c.5 — Enable AWS Cost Explorer Tag Filtering

- [ ] Document in `docs/AWS_DEPLOYMENT.md`: How to filter cost by `CostCenter` in Cost Explorer
- [ ] Create a saved Cost Explorer report filtered by `CostCenter = "antenna-edu"` (manual step, documented)
- [ ] Set billing alarm `aws_budgets_budget` (already in §8.14a.3) to use tag filter:
  ```hcl
  cost_filter {
    name   = "TagKeyValue"
    values = ["user:CostCenter$antenna-edu"]
  }
  ```
  This ensures the $5 budget alarm only tracks antenna-simulator costs, not other projects.

#### 8.14c.6 — Tagging Reference Table

Full tag set applied to every antenna-simulator resource:

| Tag Key | Value | Source | Purpose |
|---------|-------|--------|---------|
| `Project` | `antenna-simulator` | `default_tags` | Project identity |
| `Environment` | `staging` / `production` | `default_tags` | Lifecycle stage |
| `ManagedBy` | `terraform` | `default_tags` | IaC provenance |
| `Repository` | `github.com/baumgpaul/AntennaEducator` | `default_tags` | Source repo |
| `CostCenter` | `antenna-edu` | `default_tags` (NEW) | Billing separation |
| `Component` | `backend` / `frontend` / `database` / etc. | `var.tags` per module | Architecture layer |
| `Service` | `solver` / `preprocessor` / etc. | `var.tags` per module | Specific service |

**Commit**: `chore(terraform): add CostCenter tag, fix cognito tagging, enable billing separation`

---

### 8.14b — Local/Docker Deployment Compatibility Guard

> **RULE**: Every change in Phase 8 MUST work in both AWS Lambda mode AND local Docker/standalone mode. No feature may be AWS-only unless it's infrastructure config (Terraform).

#### 8.14b.1 — Dual-Mode Compatibility Checklist

For every middleware/security addition, verify:

- [ ] **Rate limiting**: Application-layer rate limiting active in Docker; skipped in Lambda (API Gateway + concurrency caps handle it)
- [ ] **Request size**: `RequestSizeMiddleware` active in both modes
- [ ] **Computational caps**: Schema-level `Field(le=...)` constraints active in both modes
- [ ] **Error standardization**: `ErrorResponse` model used in both modes
- [ ] **Structured logging**: JSON formatter works in both (CloudWatch parses JSON natively; Docker `docker logs` shows readable JSON)
- [ ] **Auth**: `LocalAuthProvider` (Docker) and `CognitoAuthProvider` (AWS) both benefit from enumeration fixes
- [ ] **CORS**: Correctly branches: Lambda skips CORS middleware (Function URLs handle it); Docker adds CORS with localhost origins

#### 8.14b.2 — Docker-Compose Smoke Test

- [ ] After each Phase 8 step, verify `docker-compose up --build` still starts all services
- [ ] Add to CI: `docker compose build` as non-blocking check (validate Dockerfiles still work)
- [ ] Ensure no new env vars are REQUIRED (provide sensible defaults for local dev):
  ```python
  # Example: rate limiting disabled by default in local dev
  ENABLE_RATE_LIMITING = os.getenv("ENABLE_RATE_LIMITING", "false").lower() == "true"
  ```

#### 8.14b.3 — Environment Variable Discipline

New env vars introduced in Phase 8:

| Variable | Default (Local) | AWS Value | Purpose |
|----------|-----------------|-----------|----------|
| `IS_LAMBDA` | `false` | `true` | Skip CORS, skip rate limiting middleware |
| `ENABLE_RATE_LIMITING` | `false` | `false` (API Gateway handles it) | Application-layer rate limiting |
| `JWT_SECRET_KEY` | **REQUIRED** (fail-fast) | N/A (Cognito mode) | HS256 JWT signing |
| `DEBUG` | `true` | `false` | Enable debug endpoints, verbose logging |
| `MAX_REQUEST_BODY_MB` | `10` | `10` | Request size cap |
| `LOG_FORMAT` | `text` | `json` | Structured logging format |

- [ ] Document all env vars in `.env.example` with comments
- [ ] `docker-compose.yml` sets local defaults; no manual env setup needed for `docker compose up`

**Commit**: `chore: verify dual-mode compatibility, env var documentation`

---

### 8.15 — Cross-Cutting: Dependency & Security Audit

- [ ] Run `pip-audit` on `requirements.txt` — fix all known vulnerabilities
- [ ] Run `npm audit` in `frontend/` — fix all known vulnerabilities
- [ ] CORS: Tighten allowed origins in production:
  ```python
  if IS_LAMBDA:
      origins = ["https://antennaeducator.nyakyagyawa.com"]
  else:
      origins = ["http://localhost:5173", "http://localhost:3000"]
  ```
- [ ] Review all `requirements.txt` pins — update outdated packages
- [ ] Review `package.json` — remove unused dependencies (at minimum `react-query` if confirmed unused)
- [ ] Replace `lodash` with `lodash-es/debounce` or native implementation (only debounce is used)

**Commit**: `chore(deps): security audit, remove unused dependencies`

---

### 8.16 — Cross-Cutting: Frontend Bundle Optimization

- [ ] Add `vite-plugin-visualizer` to analyze bundle size
- [ ] Code-split by route using `React.lazy()`:
  ```typescript
  const DesignPage = React.lazy(() => import('./features/design/DesignPage'))
  const AdminDashboard = React.lazy(() => import('./features/admin/AdminDashboard'))
  ```
- [ ] Lazy-load heavy dependencies:
  - Three.js / @react-three/fiber (only needed in design page)
  - Recharts (only needed in postprocessing views)
  - ReactFlow (only needed in circuit editor)
  - jsPDF / html2canvas (only needed for export)
- [ ] Measure before/after bundle sizes

**Commit**: `perf(frontend): code splitting, lazy loading heavy dependencies`

---

### 8.17 — Cross-Cutting: TypeScript Strictness

- [ ] **Phase 1**: Enable `"noUnusedLocals": true` and `"noUnusedParameters": true` — fix all errors
- [ ] **Phase 2**: Enable `"strictNullChecks": true` — fix nullable access patterns (this is the big one)
- [ ] **Phase 3** (stretch): Enable `"strict": true` — full strict mode
- [ ] Each phase: run `npx tsc --noEmit`, fix errors, commit

**Commit**: `chore(typescript): enable strict null checks` (per phase)

---

### 8.18 — Documentation: Module READMEs

Each module gets a comprehensive README (listed in module sections above). Summary:

| Module | README | Contents |
|--------|--------|----------|
| `backend/common/` | [ ] `backend/common/README.md` | Architecture, auth pattern, repository pattern, data models, env vars |
| `backend/preprocessor/` | [ ] `backend/preprocessor/README.md` | Antenna types, mesh model, API, builder pattern, validation |
| `backend/solver/` | [ ] `backend/solver/README.md` | PEEC method, MNA assembly, retardation, API, token model, limitations |
| `backend/postprocessor/` | [ ] `backend/postprocessor/README.md` | Near/far-field, radiation patterns, API, observation limits |
| `backend/projects/` | [ ] `backend/projects/README.md` | DynamoDB schema, project model, folders, submissions, S3 storage |
| `backend/auth/` | [ ] `backend/auth/README.md` | Standalone mode, JWT flow, relationship to common/auth |
| `frontend/` | [ ] Update `frontend/README.md` | Feature map, store architecture, API client layer, testing approach |

Additionally:
- [ ] Update root `README.md` — ensure it reflects current architecture (5 services, not 3+stubs)
- [ ] Update `.github/copilot-instructions.md` — remove references to helix, solver_fem/fdtd/mom stubs; update test counts and ESLint threshold

---

### 8.19 — Implementation Order (TDD, Module-by-Module)

| Step | Module | Key Actions | Commit Message |
|------|--------|-------------|----------------|
| 1 | Dead code removal | Delete stubs, unused files | `refactor: remove dead stub services and unused code` |
| 2 | `backend/common/` | Security fixes, mixin, validation, tests, README | `refactor(common): security fixes, repository mixin, model validation` |
| 3 | `backend/preprocessor/` | Validation, builder extraction, API tests, README | `refactor(preprocessor): input validation, builder extraction` |
| 4 | `backend/solver/` | Atomic tokens, frequency validation, numerical guards, tests, README | `refactor(solver): atomic tokens, numerical robustness` |
| 5 | `backend/postprocessor/` | Validation ordering, field guards, API tests, README | `refactor(postprocessor): validation, field computation guards` |
| 6 | `backend/projects/` | Auth fixes, schema validation, S3 error handling, README | `refactor(projects): security, schema validation` |
| 7 | `backend/auth/` | Enumeration prevention, README | `refactor(auth): prevent user enumeration` |
| 8 | Error standardization | Error model, middleware, correlation IDs | `feat(errors): standardized error responses` |
| 9 | Structured logging | JSON formatter, request logging | `feat(logging): structured JSON logging` |
| 10 | Middleware + DDoS | Request size, rate limiting, computational caps | `feat(middleware): request size limits, rate limiting, computational caps` |
| 10a | AWS cost protection | Lambda concurrency, billing alarms, kill switch | `feat(security): AWS cost caps, billing alarms, kill switch` |
| 10b | Resource tagging | CostCenter tag, fix cognito tags, enable billing separation | `chore(terraform): add CostCenter tag, fix cognito tagging` |
| 10c | Local/Docker compat | Verify dual-mode works, env var docs, smoke test | `chore: verify dual-mode compatibility, env var documentation` |
| 11 | `frontend/src/store/` | Memoize, error handlers, complex utils, tests | `refactor(store): memoize selectors, error handling` |
| 12 | `frontend/src/api/` | Cleanup, type safety, error standardization | `refactor(api): cleanup, type safety` |
| 13 | `frontend/src/types/` | Remove unused, improve types | `refactor(types): remove unused, improve safety` |
| 14 | `frontend/src/features/` | Missing tests, error boundaries, ESLint | `refactor(features): tests, error boundaries, lint` |
| 15 | Dependency audit | pip-audit, npm audit, remove unused packages | `chore(deps): security audit, cleanup` |
| 16 | Bundle optimization | Code splitting, lazy loading | `perf(frontend): code splitting, lazy loading` |
| 17 | TypeScript strictness | Enable strict checks incrementally | `chore(typescript): enable strict checks` |
| 18 | Documentation | All READMEs, update root README, copilot-instructions | `docs: comprehensive module documentation` |

---

### 8.20 — Deliverables Summary

| Artifact | Type | Status |
|----------|------|--------|
| Remove 5 dead backend directories | Cleanup | [ ] |
| Remove 6 dead frontend stubs/APIs | Cleanup | [ ] |
| `backend/common/repositories/dynamodb_mixin.py` | Refactor | [ ] |
| `backend/common/models/errors.py` | New | [ ] |
| `backend/common/middleware/error_handler.py` | New | [ ] |
| `backend/common/middleware/request_size.py` | New | [ ] |
| `backend/common/middleware/rate_limit.py` | New | [ ] |
| `backend/common/utils/logging.py` | New | [ ] |
| Lambda concurrency limits (Terraform) | Infra | [ ] |
| AWS Budget + CloudWatch alarms (Terraform) | Infra | [ ] |
| `CostCenter` tag in `default_tags` + cognito fix | Infra | [ ] |
| Cost Explorer tag activation + saved report | Manual | [ ] |
| `dev_tools/emergency_disable.ps1` | Script | [ ] |
| `dev_tools/emergency_restore.ps1` | Script | [ ] |
| `.env.example` with all Phase 8 env vars | Config | [ ] |
| `frontend/src/utils/complexNumber.ts` | New | [ ] |
| `frontend/src/utils/apiError.ts` | New | [ ] |
| 6 module READMEs | Docs | [ ] |
| Updated root README + copilot-instructions | Docs | [ ] |
| ~15 new/expanded test files (backend) | Tests | [ ] |
| ~8 new/expanded test files (frontend) | Tests | [ ] |
| Security audit report | Audit | [ ] |
| Bundle size before/after report | Perf | [ ] |
| ESLint warnings reduced from ~335 to <200 | Quality | [ ] |
| TypeScript strict null checks enabled | Quality | [ ] |

### 8.21 — Success Criteria

- [ ] All backend services: 0 ruff errors, 0 black/isort issues
- [ ] Frontend: `npx tsc --noEmit` passes with strict null checks
- [ ] Frontend: ESLint warnings < 200 (down from 335)
- [ ] Backend unit test count: >900 (currently ~800)
- [ ] Frontend test count: >100 test files (currently ~90)
- [ ] `pip-audit`: 0 known vulnerabilities
- [ ] `npm audit`: 0 high/critical vulnerabilities
- [ ] No `any` in API client return types
- [ ] All critical security issues from audit resolved
- [ ] Every module has a README
- [ ] All dead stub code removed from main branch
- [ ] AWS monthly cost stays < $5 under normal use (billing alarm set)
- [ ] Lambda concurrency capped per service (prevents runaway invocations)
- [ ] Emergency kill switch tested and documented
- [ ] All AWS resources tagged with `CostCenter = "antenna-edu"`
- [ ] Cost Explorer filters by `CostCenter` — can distinguish antenna costs from other projects
- [ ] Cognito module tags fixed (uses `merge(var.tags, ...)` like all others)
- [ ] `docker-compose up --build` still works after all changes
- [ ] No new required env vars without defaults for local dev

---

## Phase 9 — Deployment Rework ✅ COMPLETE

**Goal**: One-command deployment for both local (Docker) and cloud (AWS) targets, with clear documentation.

**Status**: Implemented in PR #65 on branch `phase9/deployment-rework`. All CI checks pass (954 backend tests, `black` / `isort` / `ruff` clean).

### 9.1 — Local / Docker Deployment ✅

- [x] **Single `docker-compose.yml`** with profiles:
  - `docker compose up` — all services + DynamoDB Local + MinIO + frontend (default)
  - `docker compose --profile monitoring up` — adds Prometheus + Grafana
- [x] **`.env.example`** with all required environment variables, sensible defaults for local (including `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`).
- [x] **Health-check ordering**: All backend services use `condition: service_healthy` on DynamoDB Local. Fixed port collision on DynamoDB (host port `DYNAMODB_LOCAL_PORT` default `8888`, not `8000`).
- [x] **Persistent volumes**: `dynamodb-data`, `minio-data`, `prometheus-data`, `grafana-data` — data survives container restarts.
- [x] **Init script** (`scripts/init_local_db.py`): Idempotent bootstrap — creates DynamoDB table (with GSI1), seeds admin user via `ADMIN_EMAIL`/`ADMIN_PASSWORD`, creates MinIO bucket. 13 unit tests.
- [x] **Wrapper scripts**: `scripts/init-local.ps1` (Windows) + `scripts/init-local.sh` (Linux/macOS) source `.env` and call the Python script.
- [x] **Documentation**: `docs/LOCAL_DEVELOPMENT.md` rewritten — Docker quick-start front and centre, manual dev path, monitoring section.
- [x] **Prometheus config**: `deployment/prometheus/prometheus.yml` scrapes all 4 backend `/metrics` endpoints.

### 9.2 — Cloud (AWS) Deployment ✅

- [x] **Unified deploy script**: `scripts/deploy.ps1` (and `deploy.sh`) — builds all Lambda Docker images, pushes to ECR, updates Lambda function code, builds and syncs frontend to S3, invalidates CloudFront. Flags: `--Environment`, `--SkipBackend`, `--SkipFrontend`, `--DryRun`.
- [x] **Environment promotion**: `scripts/promote.ps1` — pulls ECR images from staging, retags for production, pushes, updates production Lambda functions. `--DryRun` mode.
- [ ] **Terraform production environment**: `terraform/environments/production/` config — deferred until a production AWS account is provisioned.
- [ ] **Secrets management**: All secrets in AWS Secrets Manager — deferred (currently all secrets are in Lambda env vars via Terraform).
- [ ] **CI/CD GitHub Actions pipeline**: Auto-deploy on merge to `main` — deferred (currently using AWS CodePipeline + `buildspec-*.yml`).

### 9.3 — Deliverables

| Artifact | Type | Status | Description |
|----------|------|--------|-------------|
| `docker-compose.yml` rewrite | Config | ✅ Done | Health checks, profiles, persistent volumes, env_file |
| `.env.example` update | Config | ✅ Done | Full env vars including admin seeding, MinIO, monitoring |
| `scripts/init_local_db.py` | Script | ✅ Done | Idempotent DynamoDB + MinIO bootstrap |
| `tests/unit/test_init_local_db.py` | Test | ✅ Done | 13 unit tests (mocked boto3) |
| `scripts/init-local.ps1` / `init-local.sh` | Script | ✅ Done | OS-specific wrappers for init script |
| `scripts/deploy.ps1` / `deploy.sh` | Script | ✅ Done | Unified AWS deploy (backend + frontend) |
| `scripts/promote.ps1` | Script | ✅ Done | Staging → production image promotion |
| `deployment/prometheus/prometheus.yml` | Config | ✅ Done | Prometheus scrape config for monitoring profile |
| `docs/LOCAL_DEVELOPMENT.md` rewrite | Docs | ✅ Done | Docker quick-start + manual dev + env vars reference |

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
Phase 4 ─── Solver Enhancements & On-Demand Postprocessing ✅ (PR #60)
   │         Full scope: param study, Smith chart, circuit editor,
   │         ports, on-demand postprocessing, sweep merge, bug fixes
   ▼
Phase 5 ─── Postprocessing Views (Line, Smith, Polar, Table) ✅
   │         Remove results from SolverTab; all results via views
   │
   ├───────────┐
   ▼           ▼
Phase 6 ✅  Phase 7 ✅
Submissions PDF Export
   │           │
   ├───────────┘
   ▼
Phase 8 ─── Refactoring & Hardening ✅
   │         18 steps: dead code removal → module-by-module
   │         (common → preprocessor → solver → postprocessor →
   │          projects → auth → error standardization → logging →
   │          middleware → store → api → types → features →
   │          deps audit → bundle opt → TS strict → docs)
   │
   ▼
Phase 9 ─── Deployment Rework ✅
```

**Key dependencies**:
- Phase 1 (Variables) enables expression-aware inputs in Phase 2 (Custom Geometry) and Phase 3 (Lumped Elements) — both ✅ complete
- Phase 4 (Solver enhancements + parameter variation) depends on Phase 3 (port system) and uses Phase 1 variables as sweep parameters — ✅ complete (PR #60)
- Phase 5 (Postprocessing Views) needs Phase 4 complete — ✅ complete
- Phase 6 (Submissions) and Phase 7 (PDF) are independent of each other — both ✅ complete
- Phase 8 depends on Phases 0–7 complete — all feature code exists, now harden systematically
- Phase 9 depends on Phase 8 — deploy hardened code ✅ Complete (PR #65)

---

## Estimated Scope per Phase

| Phase | Backend | Frontend | Tests | Complexity | Status |
|-------|---------|----------|-------|------------|--------|
| 0 — Bug Fixes | Medium | Medium | High | Medium — many small fixes | ✅ Complete |
| 1 — Variables | Medium | High | Medium | Medium — expression parser is key risk | ✅ Complete (PR #57) + helix removal + all-field expressions + resizable panels |
| 2 — Custom Geometry | Medium | High | Medium | High — CSV parser + 3D preview + validation | ✅ Complete (PR #58) |
| 3 — Lumped/Ports | Low | High | Low | Medium — UI rework, model is straightforward | ✅ Complete (PR #59) |
| 4 — Solver | High | Medium | High | Medium — math is known, integration matters | ✅ Complete (PR #60) |
| 5 — Plotting + Smith | Low | Very High | Medium | High — unified plot model + Smith chart SVG | ✅ Complete |
| 6 — Submissions | Medium | High | Medium | Medium — CRUD + read-only mode | ✅ Complete |
| 7 — PDF Export | Low | High | Low | Medium — multi-page layout orchestration | ✅ Complete (PR #63) |
| 8 — Hardening | Very High | Very High | Very High | High — 18 steps, module-by-module, security + SOLID + tests + docs | ✅ Complete (PR #64) |
| 9 — Deployment | High | Low | Low | Medium — DevOps, scripting, Terraform | ✅ Complete (PR #65) |

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
