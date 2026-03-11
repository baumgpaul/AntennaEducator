import {
  Box,
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Chip,
  Tooltip,
  Button,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileCopy as CopyIcon,
  OpenInNew as OpenIcon,
  Description as DescriptionIcon,
  ContentCopy,
  Lock as LockIcon,
  Sensors as PeecIcon,
  GridOn as FdtdIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@/types/models';

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onDuplicate?: (project: Project) => void;
  onCopy?: (project: Project) => void;
  copyOnly?: boolean;
}

/**
 * ProjectCard - Display project information with actions
 */
function ProjectCard({ project, onEdit, onDelete, onDuplicate, onCopy, copyOnly = false }: ProjectCardProps) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleOpen = () => {
    if (copyOnly) return;
    const basePath = project.project_type === 'fdtd' ? '/fdtd' : '/project';
    navigate(`${basePath}/${project.id}/design`);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    onCopy?.(project);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    onEdit?.(project);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    onDelete?.(project);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    onDuplicate?.(project);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: copyOnly ? 'default' : 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: copyOnly ? 'none' : 'translateY(-4px)',
          boxShadow: copyOnly ? undefined : 4,
        },
        borderLeft: copyOnly ? '4px solid' : 'none',
        borderColor: copyOnly ? 'warning.main' : 'transparent',
      }}
      onClick={handleOpen}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <Box sx={{ flex: 1, pr: 1 }}>
            <Typography variant="h6" component="h3" noWrap>
              {project.name}
            </Typography>
            {copyOnly && (
              <Chip
                icon={<LockIcon sx={{ fontSize: '0.8rem !important' }} />}
                label="Copy only"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ mt: 0.5, height: 22, fontSize: '0.7rem' }}
              />
            )}
            {project.project_type === 'fdtd' ? (
              <Chip
                icon={<FdtdIcon sx={{ fontSize: '0.85rem !important' }} />}
                label="FDTD"
                size="small"
                color="secondary"
                variant="outlined"
                sx={{ mt: 0.5, height: 22, fontSize: '0.7rem' }}
              />
            ) : (
              <Chip
                icon={<PeecIcon sx={{ fontSize: '0.85rem !important' }} />}
                label="PEEC"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ mt: 0.5, height: 22, fontSize: '0.7rem' }}
              />
            )}
          </Box>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{ mt: -1, mr: -1 }}
          >
            <MoreVertIcon />
          </IconButton>
        </div>

        {project.description && !project.description.startsWith('[') && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              minHeight: '2.5em',
            }}
          >
            {project.description}
          </Typography>
        )}

        {/* Documentation indicator */}
        {project.has_documentation && (
          <Box sx={{ mt: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                color: 'text.secondary',
              }}
            >
              <DescriptionIcon sx={{ fontSize: '0.875rem' }} />
              Documentation
            </Typography>
            {project.documentation_preview && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  mt: 0.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontStyle: 'italic',
                  maxWidth: '100%',
                }}
              >
                {project.documentation_preview}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          Updated {formatDate(project.updated_at)}
        </Typography>
        {copyOnly ? (
          <Tooltip title="Copy to My Projects">
            <Button
              size="small"
              startIcon={<ContentCopy />}
              onClick={(e) => { e.stopPropagation(); onCopy?.(project); }}
            >
              Copy
            </Button>
          </Tooltip>
        ) : (
          <IconButton size="small" onClick={handleOpen}>
            <OpenIcon fontSize="small" />
          </IconButton>
        )}
      </CardActions>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        {copyOnly ? (
          <MenuItem onClick={handleCopy}>
            <ContentCopy fontSize="small" sx={{ mr: 1 }} />
            Copy to My Projects
          </MenuItem>
        ) : (
          [
            <MenuItem key="edit" onClick={handleEdit}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} />
              Edit
            </MenuItem>,
            <MenuItem key="duplicate" onClick={handleDuplicate}>
              <CopyIcon fontSize="small" sx={{ mr: 1 }} />
              Duplicate
            </MenuItem>,
            <MenuItem key="delete" onClick={handleDelete} sx={{ color: 'error.main' }}>
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
              Delete
            </MenuItem>,
          ]
        )}
      </Menu>
    </Card>
  );
}

export default ProjectCard;
