import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useAppSelector } from '@/store/hooks';

/**
 * MainLayout component - combines Header, Sidebar, Footer with content outlet
 * Sidebar width is responsive to Redux state (open/closed)
 */
function MainLayout() {
  const sidebarOpen = useAppSelector((state) => state.ui.layout.sidebarOpen);
  const sidebarWidth = sidebarOpen ? 280 : 0;

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
            marginLeft: `${sidebarWidth}px`,
            transition: (theme) => theme.transitions.create('margin', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          }}
        >
          {/* Router outlet for page content */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
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
