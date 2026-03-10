import {
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Box,
} from '@mui/material';
import {
  Folder as FolderIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CreateNewFolder as CreateNewFolderIcon,
} from '@mui/icons-material';
import { useState } from 'react';
import type { FolderTreeNode } from '@/store/foldersSlice';

interface FolderCardProps {
  folder: FolderTreeNode;
  projectCount: number;
  subfolderCount: number;
  onOpen: (folderId: string) => void;
  onRename?: (folder: FolderTreeNode) => void;
  onDelete?: (folder: FolderTreeNode) => void;
  onCreateSubfolder?: (parentId: string) => void;
}

function FolderCard({
  folder,
  projectCount,
  subfolderCount,
  onOpen,
  onRename,
  onDelete,
  onCreateSubfolder,
}: FolderCardProps) {
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
    onOpen(folder.id);
  };

  const summaryParts: string[] = [];
  if (subfolderCount > 0) summaryParts.push(`${subfolderCount} folder${subfolderCount !== 1 ? 's' : ''}`);
  if (projectCount > 0) summaryParts.push(`${projectCount} project${projectCount !== 1 ? 's' : ''}`);
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Empty';

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
        borderLeft: '4px solid',
        borderColor: 'warning.main',
      }}
      onClick={handleOpen}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, pr: 1 }}>
            <FolderIcon sx={{ color: 'warning.main', fontSize: 28 }} />
            <Typography variant="h6" component="h3" noWrap>
              {folder.name}
            </Typography>
          </Box>
          {(onRename || onDelete || onCreateSubfolder) && (
            <IconButton size="small" onClick={handleMenuOpen} sx={{ mt: -0.5, mr: -1 }}>
              <MoreVertIcon />
            </IconButton>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {summary}
        </Typography>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>
        <Typography variant="caption" color="text.secondary">
          Folder
        </Typography>
      </CardActions>

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        {onCreateSubfolder && (
          <MenuItem onClick={() => { handleMenuClose(); onCreateSubfolder(folder.id); }}>
            <CreateNewFolderIcon fontSize="small" sx={{ mr: 1 }} />
            New Subfolder
          </MenuItem>
        )}
        {onRename && (
          <MenuItem onClick={() => { handleMenuClose(); onRename(folder); }}>
            <EditIcon fontSize="small" sx={{ mr: 1 }} />
            Rename
          </MenuItem>
        )}
        {onDelete && (
          <MenuItem onClick={() => { handleMenuClose(); onDelete(folder); }} sx={{ color: 'error.main' }}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            Delete
          </MenuItem>
        )}
      </Menu>
    </Card>
  );
}

export default FolderCard;
