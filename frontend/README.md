# Antenna Educator - Frontend

React-based web interface for the PEEC Antenna Simulator.

## Current Status

**Phase 2 Progress: 63% Complete (Tasks 1-8, 9a-d of 15)**

### ✅ Completed Features

- **Foundation**: React 18 + TypeScript + Vite project setup
- **Build System**: ESLint, Prettier, environment configuration
- **Docker Infrastructure**: Full-stack docker-compose with Nginx, PostgreSQL, MinIO
- **Type System**: 50+ TypeScript interfaces matching backend models
- **API Layer**: Axios clients for all backend services (preprocessor, solver, postprocessor)
- **State Management**: Redux Toolkit with 4 domain slices (auth, projects, design, ui)
- **Application Shell**: Main layout with Header, Sidebar, Footer
- **Routing**: React Router with protected routes
- **Theme System**: Light/dark mode with localStorage persistence
- **Authentication**: Mock login/register (ready for backend integration)
- **Notifications**: Global notification system with Redux
- **Form Validation**: react-hook-form + Zod schemas for authentication pages
- **Auth API**: Real backend integration with JWT token management
- **Protected Routes**: Automatic token refresh and route protection
- **Error Handling**: Comprehensive error parsing, inline displays, retry logic

### 🎯 Working Demo

The application is viewable and interactive at **http://localhost:3000**

**You can:**
- ✅ Login with email/password validation (mock auth)
- ✅ Register with full form validation (username, email, password, confirm)
- ✅ See real-time validation errors
- ✅ Navigate between pages (Home, Projects, Design, Results)
- ✅ Toggle light/dark theme
- ✅ Toggle sidebar
- ✅ See working notifications
- ✅ Logout and return to login

### 🚧 Next Up (Task 9e & Task 10)

- Session management and timeout handling
- Projects page with CRUD operations
- Project cards and filtering

## Tech Stack

- **React 18** - UI library with hooks and concurrent features
- **TypeScript 5** - Static typing with strict mode
- **Vite 5** - Lightning-fast build tool with HMR
- **Material-UI (MUI) 5** - Comprehensive component library
- **Redux Toolkit 2.0** - State management with RTK Query
- **React Router 6** - Client-side routing
- **React Hook Form 7** - Performant form state management
- **Zod 3** - TypeScript-first schema validation
- **Three.js + React Three Fiber** - 3D visualization (planned for Task 11)
- **Axios 1.6** - HTTP client with interceptors
- **React Query** - Server state management (planned)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend services running (see backend/README.md)

### Installation

```bash
npm install
```

### Development

```bash
# Start dev server (localhost:3000)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment Configuration

Create `.env.development` for local development:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_PREPROCESSOR_URL=http://localhost:8001
VITE_SOLVER_URL=http://localhost:8002
VITE_POSTPROCESSOR_URL=http://localhost:8003
```

Production configuration is in `.env.production`.

## Project Structure

```
frontend/
├── src/
│   ├── api/                 # API client layer (Axios)
│   │   ├── client.ts        # Base HTTP client with interceptors
│   │   ├── preprocessor.ts  # Preprocessor service client
│   │   ├── solver.ts        # Solver service client
│   │   └── postprocessor.ts # Postprocessor service client
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Generic components (NotificationManager)
│   │   ├── layout/          # Layout components (Header, Sidebar, Footer)
│   │   └── visualization/   # 3D visualization components (planned)
│   ├── features/            # Feature-specific pages
│   │   ├── auth/            # Login, Register pages
│   │   ├── home/            # Home page
│   │   ├── projects/        # Projects management (placeholder)
│   │   ├── design/          # 3D design interface (placeholder)
│   │   └── results/         # Results visualization (placeholder)
│   ├── store/               # Redux state management
│   │   ├── store.ts         # Store configuration
│   │   ├── authSlice.ts     # Authentication state
│   │   ├── projectsSlice.ts # Projects CRUD state
│   │   ├── designSlice.ts   # Design workflow state
│   │   ├── uiSlice.ts       # UI state (theme, layout, notifications)
│   │   └── hooks.ts         # Typed Redux hooks
│   ├── types/               # TypeScript type definitions
│   │   ├── models.ts        # Backend data models (50+ interfaces)
│   │   ├── api.ts           # API request/response types
│   │   └── ui.ts            # UI component types
│   ├── theme/               # Material-UI theme configuration
│   │   └── index.ts         # Light and dark themes
│   ├── App.tsx              # Main app with routing
│   └── main.tsx             # React entry point
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
└── README.md                # This file
```

## Development Guide

### Running the Frontend

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:3000

### Backend Services

The frontend expects backend services running at:
- **API Gateway**: http://localhost:8000
- **Preprocessor**: http://localhost:8001
- **Solver**: http://localhost:8002
- **Postprocessor**: http://localhost:8003

Start backend services from the project root:
```bash
# Option 1: Docker Compose (recommended)
docker-compose up

# Option 2: Individual services (see backend/README.md)
```

### Current Mock Features

Since backend integration is not yet complete (Task 9), the app uses mock authentication:

**Mock Login:**
- Email: any@email.com
- Password: anything
- Creates mock user with JWT tokens stored in localStorage

**Redux State:**
- `auth.user`: Current logged-in user
- `auth.tokens`: Access and refresh tokens
- `projects.items`: Project list (empty for now)
- `design`: Antenna design state (ready for Task 11)
- `ui.theme.mode`: 'light' or 'dark'
- `ui.layout.sidebarOpen`: Sidebar visibility
- `ui.notifications`: Notification queue

### Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format
```

## Testing (Planned - Task 15)

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run coverage
```

## Building for Production

```bash
# Build optimized bundle
npm run build

# Preview production build
npm run preview
```

Build output goes to `dist/` directory.

## Docker Deployment

```bash
# Build frontend Docker image
docker build -t antenna-educator-frontend .

# Run with docker-compose (from project root)
docker-compose up frontend
```

Frontend will be served by Nginx on port 3000.

## Key Technologies

### State Management (Redux Toolkit)
- **Store**: Centralized application state
- **Slices**: Domain-specific reducers (auth, projects, design, ui)
- **Actions**: Typed action creators
- **Hooks**: `useAppDispatch`, `useAppSelector` for type safety

### Routing (React Router)
- **Protected Routes**: Redirect to login if not authenticated
- **Nested Routes**: Main layout wraps authenticated pages
- **Route Parameters**: `/design/:projectId`, `/results/:simulationId`

### API Integration (Axios)
- **Interceptors**: Automatic auth token injection
- **Error Handling**: Unified error handling with 401 logout
- **Service Clients**: Typed interfaces for backend services

### UI Components (Material-UI)
- **Theme**: Consistent design system
- **Components**: Button, TextField, Card, Dialog, etc.
- **Icons**: Material Icons library
- **Responsive**: Mobile-first design

## Contributing

1. Create feature branch from `master`
2. Make changes following code style
3. Write tests (when test infrastructure is ready)
4. Submit pull request

## Phase 2 Roadmap

- [x] **Task 1-4**: Foundation and infrastructure
- [x] **Task 5-6**: Type system and API layer
- [x] **Task 7**: Redux state management
- [x] **Task 8**: Application shell and routing ← **YOU ARE HERE**
- [ ] **Task 9**: Backend authentication integration
- [ ] **Task 10**: Project management UI
- [ ] **Task 11**: 3D design interface with Three.js
- [ ] **Task 12**: Antenna configuration dialogs
- [ ] **Task 13**: Simulation workflow
- [ ] **Task 14**: Results visualization
- [ ] **Task 15**: Testing and polish

## License

See LICENSE file in project root.
VITE_PREPROCESSOR_URL=http://localhost:8001
VITE_SOLVER_URL=http://localhost:8002
VITE_POSTPROCESSOR_URL=http://localhost:8003
```

## Project Structure

```
src/
├── api/              # API client functions
├── components/       # Reusable UI components
│   ├── common/       # Generic components (Button, Input, etc.)
│   ├── layout/       # Layout components (Header, Sidebar)
│   └── visualization/ # 3D scene components
├── features/         # Feature modules
│   ├── auth/         # Authentication
│   ├── projects/     # Project management
│   ├── design/       # Antenna design (preprocessor)
│   └── results/      # Results visualization (postprocessor)
├── store/            # Redux store and slices
├── hooks/            # Custom React hooks
├── types/            # TypeScript type definitions
├── utils/            # Helper functions
├── App.tsx           # Main application component
└── main.tsx          # Application entry point
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run tests with Vitest
- `npm run lint` - Lint code with ESLint

## Docker Deployment

See `docker-compose.yml` in the project root for full-stack deployment.

## License

MIT
