import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

/**
 * MainLayout component - combines Header, Sidebar, Footer with content outlet
 * Sidebar is a persistent drawer that overlays the content
 */
function MainLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      {/* Top header bar */}
      <Header />
      
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Outlet />
          </Box>
          
          {/* Bottom footer */}
          <Footer />
        </Box>
      </Box>
    </Box>
  );
}

export default MainLayout;
