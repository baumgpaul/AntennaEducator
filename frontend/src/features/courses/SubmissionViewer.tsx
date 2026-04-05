/**
 * SubmissionViewer — Read-only view of a submitted project snapshot.
 *
 * Loads the frozen design_state, simulation_config, simulation_results,
 * and ui_state from a submission and renders them in a non-editable layout.
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Button,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchSubmissionDetail,
  selectCurrentSubmission,
  selectDetailLoading,
  selectSubmissionsError,
} from '@/store/submissionsSlice';

const statusConfig: Record<string, { label: string; color: 'warning' | 'success' | 'info' }> = {
  submitted: { label: 'Submitted', color: 'warning' },
  reviewed: { label: 'Reviewed', color: 'success' },
  returned: { label: 'Returned', color: 'info' },
};

function SubmissionViewer() {
  const { courseId, submissionId } = useParams<{ courseId: string; submissionId: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const submission = useAppSelector(selectCurrentSubmission);
  const loading = useAppSelector(selectDetailLoading);
  const error = useAppSelector(selectSubmissionsError);

  useEffect(() => {
    if (courseId && submissionId) {
      dispatch(fetchSubmissionDetail({ courseId, submissionId }));
    }
  }, [courseId, submissionId, dispatch]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!submission) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Submission not found.</Alert>
      </Box>
    );
  }

  const cfg = statusConfig[submission.status] ?? statusConfig.submitted;
  const designState = submission.frozen_design_state as Record<string, unknown> | null;
  const elements = (designState?.elements as unknown[]) ?? [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Read-only banner */}
      <Alert severity="warning" sx={{ borderRadius: 0 }}>
        <strong>Read-Only Snapshot</strong> — This is a frozen copy of the submitted project. No changes can be made.
      </Alert>

      {/* Submission header */}
      <Paper elevation={0} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button size="small" startIcon={<ArrowBack />} onClick={() => navigate(-1)}>
            Back
          </Button>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {submission.project_name}
          </Typography>
          <Chip label={cfg.label} color={cfg.color} size="small" />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Submitted: {new Date(submission.submitted_at).toLocaleString()}
          {submission.reviewed_at && (
            <> | Reviewed: {new Date(submission.reviewed_at).toLocaleString()}</>
          )}
        </Typography>
      </Paper>

      {/* Content area */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {/* Feedback section */}
        {submission.feedback && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
            <Typography variant="subtitle2" gutterBottom>
              Instructor Feedback
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {submission.feedback}
            </Typography>
          </Paper>
        )}

        {/* Design state summary */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Design Snapshot
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {elements.length} antenna element{elements.length !== 1 ? 's' : ''} in this design.
          </Typography>
          {designState?.version && (
            <Typography variant="body2" color="text.secondary">
              Design version: {String(designState.version)}
            </Typography>
          )}
        </Paper>

        {/* Simulation results summary */}
        {submission.frozen_simulation_results && Object.keys(submission.frozen_simulation_results).length > 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Simulation Results
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Simulation data is included in this snapshot.
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default SubmissionViewer;
