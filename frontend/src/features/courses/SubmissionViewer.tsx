/**
 * SubmissionViewer — Loads a frozen submission snapshot into the Redux store
 * and navigates to the Designer in read-only mode so the examiner can see
 * the full 3D design, solver results, and postprocessing output.
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
  Divider,
} from '@mui/material';
import { ArrowBack, OpenInNew as OpenIcon } from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchSubmissionDetail,
  selectCurrentSubmission,
  selectDetailLoading,
  selectSubmissionsError,
} from '@/store/submissionsSlice';
import { loadDesign } from '@/store/designSlice';
import { loadSolverState, setFieldDefinitions } from '@/store/solverSlice';
import { loadViewConfigurations } from '@/store/postprocessingSlice';
import { clearCurrentProject } from '@/store/projectsSlice';

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

  const handleOpenInDesigner = () => {
    if (!submission) return;

    const backUrl = `/courses/${courseId}/submissions`;

    // Load solver state FIRST (loadDesign resets isSolved, so solver must be
    // re-applied after loadDesign — we do it again below)
    dispatch(loadSolverState((submission.frozen_simulation_results as Record<string, unknown>) ?? {}));

    // Load design elements
    const designState = submission.frozen_design_state as Record<string, unknown> | null;
    const elements = (designState?.elements as unknown[]) ?? [];
    dispatch(loadDesign({ elements }));

    // Re-apply solver state after loadDesign (which resets isSolved)
    dispatch(loadSolverState((submission.frozen_simulation_results as Record<string, unknown>) ?? {}));

    // Load requested fields from simulation_config
    const requestedFields =
      ((submission.frozen_simulation_config as Record<string, unknown>)?.requested_fields as unknown[]) ?? [];
    dispatch(setFieldDefinitions(requestedFields as Parameters<typeof setFieldDefinitions>[0]));

    // Load view configurations from ui_state
    const viewConfigs =
      ((submission.frozen_ui_state as Record<string, unknown>)?.view_configurations as unknown[]) ?? [];
    dispatch(loadViewConfigurations(viewConfigs as Parameters<typeof loadViewConfigurations>[0]));

    // Clear any active project so DesignPage won't reload it
    dispatch(clearCurrentProject());

    navigate(`/design?readOnly=true&back=${encodeURIComponent(backUrl)}`);
  };

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
  const hasResults =
    !!submission.frozen_simulation_results &&
    Object.keys(submission.frozen_simulation_results).length > 0;

  return (
    <Box sx={{ p: 3, maxWidth: 640, mx: 'auto' }}>
      {/* Navigation */}
      <Button
        size="small"
        startIcon={<ArrowBack />}
        onClick={() => navigate(`/courses/${courseId}/submissions`)}
        sx={{ mb: 2 }}
      >
        Back to Submissions
      </Button>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography variant="h5" sx={{ flex: 1 }}>
          {submission.project_name}
        </Typography>
        <Chip label={cfg.label} color={cfg.color} />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Student: <strong>{submission.username || submission.user_id}</strong>
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Submitted: {new Date(submission.submitted_at).toLocaleString()}
        {submission.reviewed_at && (
          <> &nbsp;·&nbsp; Reviewed: {new Date(submission.reviewed_at).toLocaleString()}</>
        )}
      </Typography>

      <Divider sx={{ mb: 3 }} />

      {/* Feedback */}
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

      {/* Snapshot summary */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Frozen Snapshot
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {elements.length} antenna element{elements.length !== 1 ? 's' : ''}
          {hasResults ? ' · Simulation results included' : ' · No simulation results'}
        </Typography>
      </Paper>

      {/* Primary action */}
      <Button
        variant="contained"
        size="large"
        startIcon={<OpenIcon />}
        onClick={handleOpenInDesigner}
        fullWidth
      >
        Open in Designer (Read-Only)
      </Button>
    </Box>
  );
}

export default SubmissionViewer;
