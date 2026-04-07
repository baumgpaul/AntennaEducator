import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import MainLayout from './components/layout/MainLayout';
import HomePage from './features/home/HomePage';
import { LoginPage, RegisterPage, ProtectedRoute } from './features/auth';
import NotFoundPage from './features/common/NotFoundPage';
import { NotificationManager, SessionManager } from './components/common';
import ErrorBoundary from './components/ErrorBoundary';

// Route-level code splitting — heavy pages loaded on demand
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'));
const DesignPage = lazy(() => import('./features/design/DesignPage'));
const ResultsPage = lazy(() => import('./features/results/ResultsPage'));
const CoursesPage = lazy(() => import('./features/courses/CoursesPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));
const MySubmissionsPage = lazy(() => import('./features/courses/MySubmissionsPage'));
const SubmissionsDashboard = lazy(() => import('./features/courses/SubmissionsDashboard'));
const SubmissionViewer = lazy(() => import('./features/courses/SubmissionViewer'));

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

        {/* Protected routes with main layout */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ErrorBoundary><Suspense fallback={<Fallback />}><ProjectsPage /></Suspense></ErrorBoundary>} />
          <Route path="/courses" element={<ErrorBoundary><Suspense fallback={<Fallback />}><CoursesPage /></Suspense></ErrorBoundary>} />
          <Route path="/courses/:courseId/submissions" element={<ErrorBoundary><Suspense fallback={<Fallback />}><SubmissionsDashboard /></Suspense></ErrorBoundary>} />
          <Route path="/my-submissions" element={<ErrorBoundary><Suspense fallback={<Fallback />}><MySubmissionsPage /></Suspense></ErrorBoundary>} />
          <Route path="/submission/:courseId/:submissionId" element={<ErrorBoundary><Suspense fallback={<Fallback />}><SubmissionViewer /></Suspense></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><Suspense fallback={<Fallback />}><AdminPage /></Suspense></ErrorBoundary>} />
          <Route path="/design" element={<ErrorBoundary><Suspense fallback={<Fallback />}><DesignPage /></Suspense></ErrorBoundary>} />
          <Route path="/project/:projectId/design" element={<ErrorBoundary><Suspense fallback={<Fallback />}><DesignPage /></Suspense></ErrorBoundary>} />
          <Route path="/project/:projectId/results" element={<ErrorBoundary><Suspense fallback={<Fallback />}><ResultsPage /></Suspense></ErrorBoundary>} />
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Box>
  );
}

export default App;
