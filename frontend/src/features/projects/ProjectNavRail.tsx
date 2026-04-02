import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
} from '@mui/material';
import {
  Home as HomeIcon,
  AccessTime as RecentIcon,
  School as SchoolIcon,
} from '@mui/icons-material';

export type NavSection = 'home' | 'recent' | 'courses';

interface ProjectNavRailProps {
  activeSection: NavSection;
  onSectionChange: (section: NavSection) => void;
}

function ProjectNavRail({ activeSection, onSectionChange }: ProjectNavRailProps) {
  const items: { id: NavSection; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'My Projects', icon: <HomeIcon /> },
    { id: 'recent', label: 'Recent', icon: <RecentIcon /> },
    { id: 'courses', label: 'Courses', icon: <SchoolIcon /> },
  ];

  return (
    <Paper
      elevation={1}
      sx={{
        width: 180,
        minWidth: 160,
        flexShrink: 0,
        overflow: 'auto',
        display: { xs: 'none', md: 'block' },
      }}
    >
      <List disablePadding>
        {items.map((item) => (
          <ListItemButton
            key={item.id}
            selected={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
            sx={{ py: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  );
}

export default ProjectNavRail;
