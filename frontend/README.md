# Antenna Educator - Frontend

React-based web interface for the PEEC Antenna Simulator.

## Tech Stack

- **React 18** with TypeScript
- **Vite** - Build tool and dev server
- **Material-UI (MUI)** - Component library
- **Redux Toolkit** - State management
- **React Router** - Navigation
- **Three.js** - 3D visualization via React Three Fiber
- **Axios** - HTTP client
- **React Query** - Server state management

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

```bash
VITE_API_BASE_URL=http://localhost:8000
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
