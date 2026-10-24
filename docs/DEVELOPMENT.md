# Development guide

How to set up a machine, the daily loop, and how work gets to staging. For code
conventions see [CONTRIBUTING.md](../CONTRIBUTING.md); for architecture,
[.github/copilot-instructions.md](../.github/copilot-instructions.md).

## 1. New machine

**Install:** Git, Python 3.11+ (CI and Lambda use 3.11; 3.13 works locally), Node 22+,
PowerShell 7, GitHub CLI, Docker Desktop. For infrastructure work also AWS CLI v2 and
Terraform ≥ 1.14.

```powershell
git clone https://github.com/baumgpaul/AntennaEducator.git
cd AntennaEducator
gh auth login                    # needed for PRs and the private notes repo
.\scripts\setup-dev.ps1          # venv, all Python packages, pre-commit, npm ci, local env files, .notes/
.\.venv\Scripts\Activate.ps1
```

`setup-dev.ps1` is safe to re-run, e.g. after dependencies changed. It ends with a list
of what is left for you. It never writes real credentials: `.env` gets a new local JWT
secret, and account-specific files are created by hand:

| Only if you… | Create | Notes |
|---|---|---|
| run the local Docker stack | `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` | any values, local only |
| run Terraform | `terraform/environments/staging/backend.hcl`, `terraform.tfvars` | key names in `.notes/LOCAL_FILES.md` |
| use AWS (logs, Terraform, `dev_tools/make_admin.py`) | AWS CLI profile `antenna-staging` (`eu-west-1`) | deploys don't need it |

Quick check: `pytest tests/unit/ -x -q` and `npm --prefix frontend run typecheck`.

### Private notes (`.notes/`)

The work list and internal documents live in the private repo
`baumgpaul/AntennaEducator-notes`, cloned into the gitignored folder `.notes/`:
`TODO.md` (what's open and next), `ROADMAP.md`, `TEST_PLAN.md`, `LOCAL_FILES.md`.
This repo is public; anything internal goes there, never here.

## 2. Working on two machines

Git is the only sync. Before you switch PCs:

1. Commit and push your branch (WIP commits are fine on a feature branch).
2. Commit and push `.notes/` if you changed `TODO.md`.

On the other PC: `git fetch`, check out the branch, `git -C .notes pull` — or let Claude
do it with `/resume`. Re-run `setup-dev.ps1` if `pyproject.toml` or
`frontend/package-lock.json` changed.

Not synced (per machine): `.env`, Terraform files, `.venv`, `node_modules`, local
Docker data, Claude Code's memory (the decisions are in [CLAUDE.md](../CLAUDE.md)).

## 3. Daily loop

```powershell
git switch main; git pull --ff-only
git switch -c feat/short-name
# … write tests first, then code …
pytest tests/unit/ -x -q                           # backend
pytest -q mesher/tests femsolver/tests tests/fem   # FEM
npm --prefix frontend run lint; npm --prefix frontend run typecheck
npm --prefix frontend run test:run -- --reporter=dot
git commit                                         # pre-commit runs the same checks
git push -u origin feat/short-name; gh pr create
```

Running the app locally: Docker stack for PEEC on http://localhost:5173; for FEM Studio
the FEM service on :8020 plus `npm --prefix frontend run dev` on http://localhost:3000.
The exact commands are in [.claude/skills/run-local/SKILL.md](../.claude/skills/run-local/SKILL.md).

## 4. From PR to staging

1. PR to `main` → **PR Checks**: Secret scan, Backend, FEM, Frontend (incl. a check that
   a build without `VITE_FEATURE_FEM` has no FEM code).
2. Add the label **`deploy-to-staging`** → **AWS Build & Deploy** builds only the changed
   services/frontend on the free GitHub runner, deploys to staging, runs a smoke test,
   and comments on the PR.
3. Test on https://antennaeducator.nyakyagyawa.com, then approve the **staging**
   environment in the workflow run → the PR is squash-merged automatically.

Infrastructure changes (`terraform/`) are applied by hand:
`cd terraform/environments/staging; terraform init -backend-config=backend.hcl; terraform plan -out=tfplan; terraform apply tfplan`.

## 5. Claude Code

[CLAUDE.md](../CLAUDE.md) is loaded automatically: project decisions, rules (public
repo, no secrets), workflow. Project skills in `.claude/skills/`:

| Skill | Use it for |
|---|---|
| `/new-machine` | after cloning: runs the setup script, explains the manual steps |
| `/resume` | start of a session or after switching PCs: sync, status, next step |
| `/check` | the CI checks locally, only for the parts you touched |
| `/ship` | branch → commit → PR in the project's style → staging label → tick TODO |
| `/run-local` | start the app (PEEC stack, FEM service, Vite) |
| `/fem-physics-tests` | the test standard for new FEM physics |

`.claude/settings.json` pre-approves read-only git/gh and test commands and blocks
Claude from reading `.env`, tfvars, `backend.hcl` and state files. Personal overrides go
in `.claude/settings.local.json` (gitignored).
