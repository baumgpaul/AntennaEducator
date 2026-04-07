/**
 * SubmitDialog — Confirmation dialog for submitting a project to a course.
 *
 * Shows project name and course info, warns that a frozen snapshot will be created.
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Alert,
  Typography,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';

interface SubmitDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectName: string;
  courseName?: string;
  examinerName?: string;
  loading: boolean;
  error?: string | null;
}

export default function SubmitDialog({
  open,
  onClose,
  onConfirm,
  projectName,
  courseName,
  examinerName,
  loading,
  error,
}: SubmitDialogProps) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Submit Project to Course</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          You are about to submit <strong>{projectName}</strong>
          {courseName && (
            <>
              {' '}to <strong>{courseName}</strong>
            </>
          )}
          .
        </DialogContentText>
        {examinerName && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Examiner: <strong>{examinerName}</strong>
          </Typography>
        )}
        <DialogContentText sx={{ mb: 1 }}>
          A frozen snapshot of your current design, simulation configuration, and results
          will be created. You can continue editing your project after submission.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={loading ? <CircularProgress size={18} /> : <SendIcon />}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Submitting…' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
