import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  Home,
  Folder,
  AddCircle,
  Dashboard,
  Assessment,
  ExpandLess,
  ExpandMore,
  ChevronLeft,
} from '@mui/icons-material';
import { useState } from 'react';
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
  const projects = useAppSelector((state) => state.projects.items);
  
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  const handleSidebarClose = () => {
    dispatch(toggleSidebar());
  };

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const toggleProjectsExpanded = () => {
    setProjectsExpanded(!projectsExpanded);
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
              selected={location.pathname.startsWith('/design')}
              onClick={() => handleNavigation('/design')}
            >
              <ListItemIcon>
                <Dashboard />
              </ListItemIcon>
              <ListItemText primary="Design" />
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding>
            <ListItemButton
              selected={location.pathname.startsWith('/results')}
              onClick={() => handleNavigation('/results')}
            >
              <ListItemIcon>
                <Assessment />
              </ListItemIcon>
              <ListItemText primary="Results" />
            </ListItemButton>
          </ListItem>
        </List>

        <Divider />

        {/* Projects list section */}
        <List>
          <ListItemButton onClick={toggleProjectsExpanded}>
            <ListItemIcon>
              <Folder />
            </ListItemIcon>
            <ListItemText primary="My Projects" />
            {projectsExpanded ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>

          <Collapse in={projectsExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {projects.length === 0 ? (
                <ListItem sx={{ pl: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No projects yet
                  </Typography>
                </ListItem>
              ) : (
                projects.map((project) => (
                  <ListItemButton
                    key={project.id}
                    sx={{ pl: 4 }}
                    onClick={() => handleNavigation(`/design/${project.id}`)}
                  >
                    <ListItemText
                      primary={project.name}
                      secondary={!project.description?.startsWith('[') ? project.description : undefined}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                ))
              )}

              {/* New project button */}
              <ListItemButton sx={{ pl: 4 }} onClick={() => handleNavigation('/projects')}>
                <ListItemIcon>
                  <AddCircle fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="New Project"
                  primaryTypographyProps={{ variant: 'body2', color: 'primary' }}
                />
              </ListItemButton>
            </List>
          </Collapse>
        </List>
      </div>
    </Drawer>
  );
}

export default Sidebar;
