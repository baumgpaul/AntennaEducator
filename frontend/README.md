# Frontend — Antenna Educator

React 18 + TypeScript + Vite web application.

## Tech Stack

- **React 18** with TypeScript 5
- **Vite** — build tool with HMR
- **MUI 5** — component library (light/dark themes)
- **Redux Toolkit** — state management (6 slices: auth, projects, design, solver, postprocessing, ui)
- **React Router 6** — client-side routing with protected routes
- **Three.js / React Three Fiber** — 3D antenna visualization
- **Axios** — API clients (one per backend service)

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest with jsdom
npx tsc --noEmit     # Type checking
```

Environment config: `.env.development` (local), `.env.production` (AWS Lambda Function URLs).

## Structure

```
src/
├── api/              # Axios clients (per service)
├── components/       # Reusable UI components
├── features/         # Feature modules
│   ├── auth/         # Login, Register, Cognito integration
│   ├── design/       # 3D antenna design workspace
│   ├── home/         # Landing page
│   ├── projects/     # Project management
│   ├── results/      # Results visualization
│   ├── solver/       # Simulation config & execution
│   └── postprocessing/ # Far-field, near-field views
├── store/            # Redux slices & typed hooks
├── types/            # TypeScript interfaces
└── App.tsx           # Routes & layout
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (→ `dist/`) |
| `npm test` | Run tests (Vitest) |
| `npm run lint` | ESLint |

## Deployment

Production builds deploy to S3 + CloudFront via `deploy-frontend.ps1`. See the [Deploying to AWS](../README.md#deploying-to-aws) section in README.
