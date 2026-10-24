---
name: new-machine
description: Set up this repo on a new or second PC after git clone — run the setup script, connect the private notes, walk the user through the account-specific files they create themselves. Use when the user says new machine, second PC, fresh clone, or setup.
---

# New machine setup

1. Check tools (the script reports them too): Git, Python 3.11+, Node 22.22+ or 24.15+, PowerShell 7,
   GitHub CLI, Docker Desktop, AWS CLI v2, Terraform ≥ 1.14 (only for infra work).
2. Run `.\scripts\setup-dev.ps1` (idempotent; `-SkipFrontend` for a quick re-run). Show the
   user the "Left for you" list at the end.
3. Things only the user can do — explain, don't do them:
   - `gh auth login` (if `.notes/` could not be cloned), then re-run the script.
   - AWS profile `antenna-staging` (`eu-west-1`), only needed for Terraform/logs/admin scripts.
     Deploys run in GitHub Actions and need nothing locally.
   - Terraform files `backend.hcl` and `terraform.tfvars` per `.notes/LOCAL_FILES.md`.
     **Never** read, print or copy their values, and never write them into the repo.
   - Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (local stack only).
4. Verify quickly: `pytest tests/unit/ -x -q`, `pytest -q femsolver/tests`,
   `npm --prefix frontend run typecheck`. Report the results.
5. Optional: seed Claude memory from `.notes/memory/` (see `.notes/LOCAL_FILES.md`). Not needed —
   `CLAUDE.md` carries the decisions.
6. Continue with `/resume`.
