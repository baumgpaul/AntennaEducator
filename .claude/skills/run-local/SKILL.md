---
name: run-local
description: Start the app locally (Docker stack for PEEC, plus the FEM service and Vite dev server for FEM Studio) to see a change working in the browser.
---

# Run locally

Prerequisite: `.\scripts\setup-dev.ps1` has run (`.venv`, `node_modules`, `.env`,
`frontend/.env.development.local`). Docker Desktop running.

## PEEC stack (Docker)

```powershell
docker compose up -d --build         # DynamoDB Local (:8888), MinIO (:9000/9001), services, nginx (:8000), frontend (:5173)
.\scripts\init-local.ps1             # first time only: table, admin user from .env, results bucket
docker compose --profile seed up course-seeder   # optional: course content
```
Open http://localhost:5173 and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## FEM Studio (host-run service + Vite dev server)

The Docker frontend is built without the FEM flag; for FEM use the dev server.
The FEM service does not read `.env` itself and must share the stack's JWT secret and DynamoDB:

```powershell
# terminal 1 — FEM service on :8020 with .env loaded into the process
Get-Content .env | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; $v = ($v -replace '\s+#.*$', '').Trim().Trim('"')
    Set-Item "Env:$($k.Trim())" $v }
$env:DYNAMODB_ENDPOINT_URL = 'http://localhost:8888'   # host port of DynamoDB Local
.\.venv\Scripts\python.exe -m uvicorn backend.fem.main:app --port 8020 --reload

# terminal 2 — Vite dev server on :3000 (VITE_FEATURE_FEM=true from .env.development.local)
npm --prefix frontend run dev
```
Open http://localhost:3000. `/api` is proxied to the projects service (:8010, from Docker);
FEM calls go to `VITE_FEM_URL` (default http://localhost:8020). FEM needs a maintainer or admin
account — the `.env` admin qualifies.

Run long-lived servers in the background (`run_in_background`) and check `/health` on each port
before driving the UI. Stop with `docker compose down` (data stays in volumes).
