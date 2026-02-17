import { Box } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

/**
 * MainLayout component - combines Header, Sidebar, Footer with content outlet
 * Sidebar is a persistent drawer that overlays the content
 *
 * Footer is hidden on full-screen workspace pages (Designer) to prevent overlap
 * with the right properties panel.
 */
function MainLayout() {
  const location = useLocation();

  // Hide footer on design pages (full-screen workspaces like Designer, Solver, Postprocessing)
  const isDesignPage = location.pathname.includes('/design/');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top header bar */}
      <Header />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar */}
        <Sidebar />

        {/* Main content area */}
        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Router outlet for page content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Outlet />
          </div>

          {/* Bottom footer - hidden on design workspace pages */}
          {!isDesignPage && <Footer />}
        </Box>
      </div>
    </div>
  );
}

export default MainLayout;
