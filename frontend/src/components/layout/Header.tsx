import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Brightness4,
  Brightness7,
  AccountCircle,
  Logout,
} from '@mui/icons-material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar, toggleTheme } from '@/store/uiSlice';
import { logoutAsync } from '@/store/authSlice';

/**
 * Header component with navigation, theme toggle, and user menu
 */
function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { mode } = useAppSelector((state) => state.ui.theme);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    // Logout via auth service (handles both Cognito and local JWT)
    await dispatch(logoutAsync());
    handleMenuClose();
    navigate('/login');
  };

  const handleThemeToggle = () => {
    dispatch(toggleTheme());
  };

  const handleSidebarToggle = () => {
    dispatch(toggleSidebar());
  };

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        {/* Menu button to toggle sidebar */}
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          onClick={handleSidebarToggle}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        {/* Application title */}
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Antenna Educator
        </Typography>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Theme toggle */}
          <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton color="inherit" onClick={handleThemeToggle}>
              {mode === 'light' ? <Brightness4 /> : <Brightness7 />}
            </IconButton>
          </Tooltip>

          {/* User menu */}
          <Tooltip title="Account settings">
            <IconButton
              onClick={handleMenuOpen}
              color="inherit"
              aria-controls={isMenuOpen ? 'account-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={isMenuOpen ? 'true' : undefined}
            >
              {user?.username ? (
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                  {user.username.charAt(0).toUpperCase()}
                </Avatar>
              ) : (
                <AccountCircle />
              )}
            </IconButton>
          </Tooltip>
        </div>

        {/* User dropdown menu */}
        <Menu
          id="account-menu"
          anchorEl={anchorEl}
          open={isMenuOpen}
          onClose={handleMenuClose}
          onClick={handleMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {user?.email || 'Guest User'}
            </Typography>
          </MenuItem>
          <MenuItem onClick={handleLogout}>
            <Logout fontSize="small" sx={{ mr: 1 }} />
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
