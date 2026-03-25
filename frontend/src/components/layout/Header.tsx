import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Brightness4,
  Brightness7,
  AccountCircle,
  Logout,
  Token as TokenIcon,
  AllInclusive,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar, toggleTheme } from '@/store/uiSlice';
import { logoutAsync, getCurrentUserAsync } from '@/store/authSlice';

/**
 * Header component with navigation, theme toggle, and user menu
 */
function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { mode } = useAppSelector((state) => state.ui.theme);
  const projectName = useAppSelector((state) => state.projects.currentProject?.name);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(anchorEl);

  // Refresh token balance whenever the user returns to this tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        dispatch(getCurrentUserAsync());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [dispatch]);

  const hasActiveFlatrate =
    !!user?.flatrate_until && new Date(user.flatrate_until) > new Date();

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
          {projectName && (
            <Typography
              component="span"
              variant="subtitle1"
              sx={{ ml: 1.5, opacity: 0.85, fontWeight: 400 }}
            >
              — {projectName}
            </Typography>
          )}
        </Typography>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Token balance */}
          {user && (
            <Tooltip
              title={
                hasActiveFlatrate
                  ? `Flatrate active until ${new Date(user.flatrate_until!).toLocaleDateString()}`
                  : `${user.simulation_tokens ?? 0} simulation tokens remaining`
              }
            >
              <Chip
                icon={hasActiveFlatrate ? <AllInclusive /> : <TokenIcon />}
                label={hasActiveFlatrate ? 'Flatrate' : String(user.simulation_tokens ?? 0)}
                size="small"
                color={hasActiveFlatrate ? 'success' : (user.simulation_tokens ?? 0) > 0 ? 'default' : 'error'}
                variant="outlined"
                sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)' }}
              />
            </Tooltip>
          )}

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
