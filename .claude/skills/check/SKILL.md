---
name: check
description: Run the same lint, type and test checks as CI (pr-checks.yml) locally before committing. Optional argument backend | fem | frontend | all; default picks the parts touched by the current diff against origin/main.
---

# Local CI checks

Run from the repo root with `.venv` activated (or call `.venv\Scripts\python.exe -m …`).
Pick the parts from `git diff --name-only origin/main...` plus uncommitted changes, unless the
argument says otherwise. Run independent parts in parallel; report pass/fail with counts.

**backend** (`backend/`, `tests/`, `pyproject.toml`):
```powershell
black --check backend/ tests/
isort --check-only backend/ tests/
ruff check backend/ tests/
pytest tests/unit/ -x -q --tb=short
pytest tests/integration/ -q --tb=short   # in-process; can be slow locally (firewall), CI is the reference
```
Formatting failures: run `black backend/ tests/` / `isort backend/ tests/` and show the diff.

**fem** (`mesher/`, `femsolver/`, `backend/fem/`, `tests/fem/`, `backend/common/`):
```powershell
pytest -q mesher/tests
pytest -q femsolver/tests
pytest -q tests/fem
```

**frontend** (`frontend/`):
```powershell
npm --prefix frontend run lint            # warning ceiling = --max-warnings in package.json
npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- --reporter=dot
```
If the ESLint warning count dropped below the ceiling, lower `--max-warnings` in
`frontend/package.json` to the new count (ratchet). Never raise it.

**flag-off build** (when anything FEM/preview-related changed in `frontend/`):
```powershell
Push-Location frontend; $env:VITE_FEATURE_FEM = 'false'
npx vite build --outDir "$env:TEMP\dist-noflags" --emptyOutDir | Out-Null
Remove-Item Env:VITE_FEATURE_FEM; Pop-Location
Get-ChildItem "$env:TEMP\dist-noflags" -Recurse -File | Select-String -Pattern 'fem-studio|FEM Studio' -List
```
Any match = FEM code leaks into builds without the flag → must be fixed.

**lambda deps** (only if `requirements-lambda.txt` changed, needs Docker):
`docker run --rm -v "${PWD}/requirements-lambda.txt:/tmp/req.txt:ro" --entrypoint pip public.ecr.aws/lambda/python:3.11 install --dry-run --only-binary=:all: -r /tmp/req.txt`

Report failures with the relevant output. Don't commit with `--no-verify` unless the user says so.
