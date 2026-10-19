import { ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Science } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import { canUseFem } from '@/config/features';

/** Sidebar entry for FEM Studio (preview); loaded only in builds with the flag. */
function FemNavItem() {
  const user = useAppSelector((state) => state.auth.user);
  const navigate = useNavigate();
  const location = useLocation();
  if (!canUseFem(user)) return null;
  return (
    <ListItem disablePadding>
      <ListItemButton selected={location.pathname === '/fem'} onClick={() => navigate('/fem')}>
        <ListItemIcon>
          <Science />
        </ListItemIcon>
        <ListItemText primary="FEM Studio" secondary="Preview" />
      </ListItemButton>
    </ListItem>
  );
}

export default FemNavItem;
