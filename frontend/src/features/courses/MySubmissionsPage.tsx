/**
 * MySubmissionsPage — Student view of all their submissions across courses.
 *
 * Shows a card list of submissions with status, feedback preview,
 * and link to open the frozen snapshot in read-only mode.
 */

import { useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Send as SendIcon,
  CheckCircle,
  Replay,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchMySubmissions,
  selectMySubmissions,
  selectSubmissionsLoading,
  selectSubmissionsError,
} from '@/store/submissionsSlice';

const statusConfig: Record<string, { label: string; color: 'warning' | 'success' | 'info' }> = {
  submitted: { label: 'Submitted', color: 'warning' },
  reviewed: { label: 'Reviewed', color: 'success' },
  returned: { label: 'Returned', color: 'info' },
};

function MySubmissionsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const submissions = useAppSelector(selectMySubmissions);
  const loading = useAppSelector(selectSubmissionsLoading);
  const error = useAppSelector(selectSubmissionsError);

  useEffect(() => {
    dispatch(fetchMySubmissions());
  }, [dispatch]);

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'reviewed':
        return <CheckCircle fontSize="small" color="success" />;
      case 'returned':
        return <Replay fontSize="small" color="info" />;
      default:
        return <SendIcon fontSize="small" color="warning" />;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        My Submissions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        View all your course project submissions and instructor feedback.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : submissions.length === 0 ? (
        <Alert severity="info">
          You haven&apos;t submitted any projects yet. Open a course project and use the
          &ldquo;Submit&rdquo; button in the Designer ribbon.
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {submissions.map((sub) => {
            const cfg = statusConfig[sub.status] ?? statusConfig.submitted;
            return (
              <Card key={sub.submission_id} variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <StatusIcon status={sub.status} />
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>
                      {sub.project_name}
                    </Typography>
                    <Chip label={cfg.label} color={cfg.color} size="small" />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Submitted: {new Date(sub.submitted_at).toLocaleString()}
                  </Typography>
                  {sub.feedback && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Feedback:
                      </Typography>
                      <Typography variant="body2">
                        {sub.feedback.length > 200
                          ? sub.feedback.slice(0, 200) + '…'
                          : sub.feedback}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() =>
                      navigate(
                        `/submission/${sub.course_id}/${sub.submission_id}`,
                      )
                    }
                  >
                    View Snapshot
                  </Button>
                </CardActions>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default MySubmissionsPage;
