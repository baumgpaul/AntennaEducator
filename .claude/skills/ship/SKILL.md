---
name: ship
description: Take finished work to a pull request — branch, checks, Conventional Commit, push, PR in the project's style, optional staging deploy, then tick the item in the private TODO. Use when the user says ship it, open a PR, commit and push, or deploy to staging.
---

# Ship a change

1. **Branch**: never commit on `main`. Name `feat/…`, `fix/…`, `docs/…`, `ci/…`, `chore/…`, `deps/…`.
2. **Checks**: run `/check` for the touched parts. Fix failures first.
3. **Secrets pass**: `git diff --cached` must not contain credentials, `.env`/tfvars/`backend.hcl`
   values, AWS account or resource IDs, user lists, or a street address. gitleaks will also run in
   the pre-commit hook.
4. **Commit**: Conventional Commits, scope as used in history (`feat(fem): C1 — …`,
   `fix(physics): …`, `ci(dependabot): …`). Body explains why. Use the attribution trailer the
   harness specifies.
5. **Push + PR**: `git push -u origin <branch>`, `gh pr create --base main`. Body (see PR #174):
   - one-line context (which plan step this is, what follows),
   - `## What` — user-visible effect first, plain language, short bullets,
   - `## Verified` — concrete evidence: test counts, physics error vs theory/order of convergence,
     ESLint count vs ceiling, flag-off build clean, staging smoke test.
   Never put open security findings or bug details from `.notes/` into the public PR.
6. **Deploy**: ask before adding the `deploy-to-staging` label (`gh pr edit <n> --add-label deploy-to-staging`).
   The workflow deploys changed targets, comments on the PR, then waits for the user's approval of
   the "staging" environment; approval auto squash-merges. Watch with `gh pr checks <n>`.
   A run stuck "waiting" after a new push is force-cancelled by the workflow itself.
7. **After merge**: in `.notes/TODO.md` tick the item and add the PR number (and the date in the Done
   log for notable items); `git -C .notes commit -am "…"; git -C .notes push`.
   Then `git switch main; git pull --ff-only` and delete the merged local branch.
