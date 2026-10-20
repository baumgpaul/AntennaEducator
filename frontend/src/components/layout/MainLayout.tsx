import { Box } from '@mui/material';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

/**
 * MainLayout component - combines Header, Sidebar, Footer with content outlet
 *
 * Footer is hidden on full-screen workspace pages (Designer) to prevent overlap
 * with the right properties panel.
 */
function MainLayout() {
  const location = useLocation();

  // Hide footer on the full-screen workspaces (antenna design, field solver)
  // Match /design, /project/:id/design and the like (with or without trailing slash)
  const isDesignPage = /\/(design|fem)(\/|$)/.test(location.pathname);

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
