import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import MainLayout from './components/layout/MainLayout';
import HomePage from './features/home/HomePage';
import { LoginPage, RegisterPage, ProtectedRoute, RequireRole } from './features/auth';
import NotFoundPage from './features/common/NotFoundPage';
import { NotificationManager, SessionManager } from './components/common';
import ErrorBoundary from './components/ErrorBoundary';
import RequireFem from './features/auth/RequireFem';

// Route-level code splitting — heavy pages loaded on demand
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'));
const DesignPage = lazy(() => import('./features/design/DesignPage'));
const CoursesPage = lazy(() => import('./features/courses/CoursesPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const MySubmissionsPage = lazy(() => import('./features/courses/MySubmissionsPage'));
const SubmissionsDashboard = lazy(() => import('./features/courses/SubmissionsDashboard'));
const SubmissionViewer = lazy(() => import('./features/courses/SubmissionViewer'));
const LegalPage = lazy(() => import('./features/legal/LegalPage'));
// Not in the bundle at all unless the deployment enables FEM (config/features.ts).
// The literal env check (not FEATURE_FEM) is what lets the bundler drop the chunk.
const FemStudioPage =
  import.meta.env.VITE_FEATURE_FEM === 'true' ? lazy(() => import('./features/fem/FemStudioPage')) : null;

const Fallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
    <CircularProgress />
  </Box>
);

/**
 * Main App component with routing configuration
 */
function App() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Global notification system */}
      <NotificationManager />

      {/* Session timeout management */}
      <SessionManager />

      {/* Route definitions */}
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<Suspense fallback={<Fallback />}><LegalPage doc="privacy" /></Suspense>} />
        <Route path="/imprint" element={<Suspense fallback={<Fallback />}><LegalPage doc="imprint" /></Suspense>} />

        {/* Protected routes with main layout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ErrorBoundary><Suspense fallback={<Fallback />}><ProjectsPage /></Suspense></ErrorBoundary>} />
          <Route path="/courses" element={<ErrorBoundary><Suspense fallback={<Fallback />}><CoursesPage /></Suspense></ErrorBoundary>} />
          <Route path="/courses/:courseId/submissions" element={<ErrorBoundary><Suspense fallback={<Fallback />}><SubmissionsDashboard /></Suspense></ErrorBoundary>} />
          <Route path="/my-submissions" element={<ErrorBoundary><Suspense fallback={<Fallback />}><MySubmissionsPage /></Suspense></ErrorBoundary>} />
          <Route path="/submission/:courseId/:submissionId" element={<ErrorBoundary><Suspense fallback={<Fallback />}><SubmissionViewer /></Suspense></ErrorBoundary>} />
          <Route path="/admin" element={<RequireRole role="admin"><ErrorBoundary><Suspense fallback={<Fallback />}><AdminPage /></Suspense></ErrorBoundary></RequireRole>} />
          <Route path="/design" element={<ErrorBoundary><Suspense fallback={<Fallback />}><DesignPage /></Suspense></ErrorBoundary>} />
          <Route path="/project/:projectId/design" element={<ErrorBoundary><Suspense fallback={<Fallback />}><DesignPage /></Suspense></ErrorBoundary>} />
          {FemStudioPage && (
            <Route path="/fem" element={<RequireFem><ErrorBoundary><Suspense fallback={<Fallback />}><FemStudioPage /></Suspense></ErrorBoundary></RequireFem>} />
          )}
          {FemStudioPage && (
            <Route path="/project/:projectId/fem" element={<RequireFem><ErrorBoundary><Suspense fallback={<Fallback />}><FemStudioPage /></Suspense></ErrorBoundary></RequireFem>} />
          )}
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Box>
  );
}

export default App;
