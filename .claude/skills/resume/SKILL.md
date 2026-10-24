---
name: resume
description: Start of a work session or after switching PCs — sync the repo and the private notes, report where the project stands (open PRs, CI, TODO) and propose the next step. Use when the user says "resume", "where were we", "continue", "what's next" or starts working on this machine.
---

# Resume work

The user works on two PCs. Never assume this machine is up to date.

1. **Sync** (report, don't fix silently):
   - `git fetch --prune`, `git status -sb`. Uncommitted changes or unpushed commits → tell the user before anything else.
   - Current branch already merged into `origin/main` (check `gh pr view --json state`) → offer `git switch main; git pull --ff-only`.
   - `.notes/` missing → `gh repo clone baumgpaul/AntennaEducator-notes .notes`; present → `git -C .notes pull --ff-only`.
   - `.venv` or `frontend/node_modules` missing → suggest `.\scripts\setup-dev.ps1`. If `pyproject.toml`, `*/pyproject.toml` or `frontend/package-lock.json` changed since the last pull, suggest re-running it.
2. **State**:
   - `gh pr list --state open` (with labels) and `gh run list --limit 5` — note failing runs and runs waiting at the "Verify Staging" approval gate.
   - Read `.notes/TODO.md`: the "⚠️ Open — needs you" list, and the first unchecked item of the current plan (Phase 3 / "Unified PEEC + FEM" section).
3. **Report** in a few lines: where we stand (last merged PR, open PRs, CI), what needs the user, and **one** recommended next step with a short plan. Wait for the user's go before starting larger work.
