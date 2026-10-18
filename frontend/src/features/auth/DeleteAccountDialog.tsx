import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { deleteAccount } from '@/api/auth';
import { useAppDispatch } from '@/store/hooks';
import { logoutAsync } from '@/store/authSlice';

interface DeleteAccountDialogProps {
  open: boolean;
  email: string;
  onClose: () => void;
}

/** Self-service account deletion (GDPR right to erasure). */
export default function DeleteAccountDialog({ open, email, onClose }: DeleteAccountDialogProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (busy) return;
    setConfirmation('');
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await dispatch(logoutAsync());
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Deleting the account failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Delete account</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          This permanently deletes your account, all your projects and simulation results,
          your course enrollments and your submissions. This cannot be undone.
        </DialogContentText>
        <DialogContentText sx={{ mb: 1 }}>
          Type <strong>{email}</strong> to confirm.
        </DialogContentText>
        <TextField
          autoFocus
          fullWidth
          size="small"
          label="E-mail"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={busy}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={handleDelete}
          disabled={busy || confirmation.trim().toLowerCase() !== email.toLowerCase()}
        >
          Delete account
        </Button>
      </DialogActions>
    </Dialog>
  );
}
