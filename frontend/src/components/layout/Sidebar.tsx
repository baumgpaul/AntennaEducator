import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Home,
  Folder,
  ChevronLeft,
  School,
  AdminPanelSettings,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/store/uiSlice';

/**
 * Sidebar component with navigation menu and project list
 */
function Sidebar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useAppSelector((state) => state.ui.layout.sidebarOpen);
  const user = useAppSelector((state) => state.auth.user);

  const isAdmin = user?.role === 'admin';

  const handleSidebarClose = () => {
    dispatch(toggleSidebar());
  };

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const drawerWidth = 280;

  return (
    <Drawer
      variant="persistent"
      anchor="left"
      open={sidebarOpen}
      sx={{
        width: sidebarOpen ? drawerWidth : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          top: '64px', // Below header
          height: 'calc(100vh - 64px)',
        },
      }}
    >
      <div style={{ overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px' }}>
          <IconButton onClick={handleSidebarClose}>
            <ChevronLeft />
          </IconButton>
        </div>

        <Divider />

        {/* Main navigation menu */}
        <List>
          <ListItem disablePadding>
            <ListItemButton
              selected={location.pathname === '/'}
              onClick={() => handleNavigation('/')}
            >
              <ListItemIcon>
                <Home />
              </ListItemIcon>
              <ListItemText primary="Home" />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding>
            <ListItemButton
              selected={location.pathname === '/projects'}
              onClick={() => handleNavigation('/projects')}
            >
              <ListItemIcon>
                <Folder />
              </ListItemIcon>
              <ListItemText primary="Projects" />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding>
            <ListItemButton
              selected={location.pathname === '/courses'}
              onClick={() => handleNavigation('/courses')}
            >
              <ListItemIcon>
                <School />
              </ListItemIcon>
              <ListItemText primary="Courses" />
            </ListItemButton>
          </ListItem>

          {isAdmin && (
            <ListItem disablePadding>
              <ListItemButton
                selected={location.pathname === '/admin'}
                onClick={() => handleNavigation('/admin')}
              >
                <ListItemIcon>
                  <AdminPanelSettings />
                </ListItemIcon>
                <ListItemText primary="Admin" />
              </ListItemButton>
            </ListItem>
          )}
        </List>

      </div>
    </Drawer>
  );
}

export default Sidebar;
