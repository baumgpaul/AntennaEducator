# CLAUDE.md — Antenna Educator

Teaching platform for electromagnetics: PEEC antenna simulator (product) + FEM Studio
(preview, flag-gated). Python/FastAPI microservices on AWS Lambda, React/TypeScript SPA,
Terraform. Architecture and code conventions: [.github/copilot-instructions.md](.github/copilot-instructions.md)
(older; where it disagrees with this file, this file wins). Setup and daily workflow for
humans: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Where work is tracked

- **`.notes/TODO.md`** — the single work list (open items, next steps, done log). `.notes/`
  is a clone of the **private** repo `baumgpaul/AntennaEducator-notes` (gitignored here).
  Also there: `ROADMAP.md` (rationale, security audit), `TEST_PLAN.md` (bug IDs B…/C…),
  `LOCAL_FILES.md`, `memory/` (decisions from PC 1).
- If `.notes/` is missing: `gh repo clone baumgpaul/AntennaEducator-notes .notes`.
- After finishing an item: tick it in `.notes/TODO.md` with the PR number, commit and push
  the notes repo. Pull it at the start of a session (the user works on two PCs).

## Public repo — no secrets, no private data

The repo is **public**. Never commit or paste into code, tests, docs, PR text or artifacts:
credentials, `.env`/tfvars/`backend.hcl` values, AWS account/resource IDs, state bucket
names, user lists, the security audit or open-bug details (those stay in `.notes/`).
Never write the operator's street address or postcode anywhere (not even in negative test
assertions); operator details live only in `frontend/src/features/legal/operator.ts`.
gitleaks runs in pre-commit and CI ("Secret scan" is required on `main`).

## Decisions that shape the work

- Audience: university courses. **No public signup** — an admin approves every account.
  Don't propose open-signup features.
- **FEM before FDTD**; FDTD is archived (tags `archive/fdtd-*`).
- FEM Studio: own transparent solver (`femsolver/`, numpy/scipy, P1), Gmsh mesher
  (`mesher/`), service `backend/fem` (`/svc/fem`, port 8020 locally). openCFS file format
  must be supported (the user's institute develops openCFS). Order: 2D electrostatics →
  axisymmetric → current flow → heat → Joule heating → 3D → magnetostatics → frequency-domain.
- FEM is a **preview**: build flag `VITE_FEATURE_FEM` (Terraform `enable_fem`), visible only
  to maintainers/admins; CI checks a flag-off build has no FEM markers. Keep FEM work on
  `main` behind the flag, no long-lived branches.
- Unified PEEC + FEM plan, order A → B → C → D (A1–C1 done; see `.notes/TODO.md` for the
  current step). Shared modules: `features/workflow` (shell), `features/fieldview`
  (field viewer), `features/results` (results workspace).
- **Physics test standard** for every new physics/solver feature: analytic benchmarks,
  manufactured-solution convergence rates, energy/charge consistency, per-BC tests,
  symmetry/invariance, regression fixtures — before merging (skill `/fem-physics-tests`).
- Dependabot: monthly, grouped, **no automatic majors**. Don't re-enable weekly/majors;
  fix or close failing Dependabot PRs quickly and add the major to TODO "Planned major upgrades".
- Cost first: cheap defaults (GitHub runner deploys, no NAT gateway, no WAF). Flag any
  change that adds recurring AWS cost, with an estimate.
- The AWS account (profile `antenna-staging`, `eu-west-1`) is shared with unrelated
  projects: only touch resources of this project (`antenna-simulator-*`, tag `Project`).

## Workflow

- Branch from `main` (`feat/…`, `fix/…`, `docs/…`, `ci/…`, `chore/…`), Conventional Commits,
  PR to `main`. Required checks: Secret scan, Backend, Frontend (+ FEM job).
- Deploy = add label `deploy-to-staging` to the PR → GitHub Actions builds changed targets,
  deploys to staging, smoke test → the user approves the "staging" gate → auto squash-merge.
  Adding the label and merging are the user's call: ask first.
- PR descriptions: "What" (plain language, user-visible effect first) and "Verified"
  (concrete numbers: test counts, physics errors vs theory, lint count).
- TDD; run the checks before every commit (skill `/check`). ESLint has a warning ceiling
  (`--max-warnings` in `frontend/package.json`); lower it when you remove warnings, never raise it.

## Commands (PowerShell, repo root, `.venv` activated)

```powershell
.\scripts\setup-dev.ps1                         # fresh clone → ready (idempotent)
black --check backend/ tests/; isort --check-only backend/ tests/; ruff check backend/ tests/
pytest tests/unit/ -x -q                        # backend unit tests (seconds)
pytest -q mesher/tests femsolver/tests tests/fem # FEM
npm --prefix frontend run lint; npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- --reporter=dot
```

Skills in `.claude/skills/`: `/resume` (start of session), `/check`, `/ship`,
`/run-local`, `/fem-physics-tests`, `/new-machine`.

## Gotchas

- `.env` is not loaded by most services; host-run services need its variables in the
  process env (see `/run-local`). DynamoDB Local is on host port **8888** (8000 is nginx).
- Integration tests' localhost probes can hang locally (firewall) — CI is the reference.
- Terraform: `terraform init -backend-config=backend.hcl`; staging tfvars must keep
  `async_jobs = "lambda"` and `enable_fem = true`. Never run `terraform/bootstrap` (local
  state lives on PC 1 only).
- Frontend: import MUI icons from the package root (`@mui/icons-material`), not deep paths
  (React error #130 under Vite 8; ESLint-guarded).
