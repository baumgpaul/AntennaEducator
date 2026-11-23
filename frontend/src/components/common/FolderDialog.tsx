import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import { useState } from 'react';

interface FolderDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  title?: string;
  initialName?: string;
  submitLabel?: string;
}

/**
 * FolderDialog — Simple dialog for creating or renaming a folder.
 */
function FolderDialog({
  open,
  onClose,
  onSubmit,
  title = 'New Folder',
  initialName = '',
  submitLabel = 'Create',
}: FolderDialogProps) {
  const [name, setName] = useState(initialName);

  // Start from initialName each time the dialog opens (adjusted during render)
  const resetFor = open ? initialName : null;
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  if (resetFor !== syncedFor) {
    setSyncedFor(resetFor);
    if (resetFor !== null) setName(resetFor);
  }

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (trimmed.length >= 1 && trimmed.length <= 100) {
      onSubmit(trimmed);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Folder Name"
          fullWidth
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          error={name.trim().length > 0 && name.trim().length < 1}
          helperText={name.trim().length > 100 ? 'Max 100 characters' : ''}
          slotProps={{
            htmlInput: { maxLength: 100 }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={name.trim().length < 1}
        >
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default FolderDialog;
