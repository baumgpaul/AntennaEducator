import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import MainLayout from './components/layout/MainLayout';
import HomePage from './features/home/HomePage';
import ProjectsPage from './features/projects/ProjectsPage';
import DesignPage from './features/design/DesignPage';
import ResultsPage from './features/results/ResultsPage';
import { LoginPage, RegisterPage, ProtectedRoute } from './features/auth';
import NotFoundPage from './features/common/NotFoundPage';
import { NotificationManager, SessionManager } from './components/common';

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
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/design" element={<DesignPage />} />
          <Route path="/project/:projectId/design" element={<DesignPage />} />
          <Route path="/project/:projectId/results" element={<ResultsPage />} />
        </Route>
        
        {/* 404 catch-all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Box>
  );
}

export default App;
