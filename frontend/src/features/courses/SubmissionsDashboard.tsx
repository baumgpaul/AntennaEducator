/**
 * SubmissionsDashboard — Instructor view of all submissions within a course.
 *
 * Lists submissions with student info, status badges, and a review dialog
 * for adding text feedback.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  RateReview as ReviewIcon,
  CheckCircle,
  Replay,
  Send as SendIcon,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  fetchCourseSubmissions,
  reviewSubmission,
  selectCourseSubmissions,
  selectSubmissionsLoading,
  selectReviewLoading,
  selectSubmissionsError,
} from '@/store/submissionsSlice';

const statusConfig: Record<string, { label: string; color: 'warning' | 'success' | 'info' }> = {
  submitted: { label: 'Submitted', color: 'warning' },
  reviewed: { label: 'Reviewed', color: 'success' },
  returned: { label: 'Returned', color: 'info' },
};

function SubmissionsDashboard() {
  const { courseId } = useParams<{ courseId: string }>();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const submissions = useAppSelector(selectCourseSubmissions);
  const loading = useAppSelector(selectSubmissionsLoading);
  const reviewLoading = useAppSelector(selectReviewLoading);
  const error = useAppSelector(selectSubmissionsError);

  // Review dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ submissionId: string; projectName: string } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'reviewed' | 'returned'>('reviewed');

  useEffect(() => {
    if (courseId) {
      dispatch(fetchCourseSubmissions(courseId));
    }
  }, [courseId, dispatch]);

  const handleOpenReview = (submissionId: string, projectName: string, existingFeedback: string) => {
    setReviewTarget({ submissionId, projectName });
    setFeedback(existingFeedback);
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!courseId || !reviewTarget) return;
    const result = await dispatch(
      reviewSubmission({
        courseId,
        submissionId: reviewTarget.submissionId,
        feedback,
        status: reviewStatus,
      }),
    );
    if (reviewSubmission.fulfilled.match(result)) {
      setReviewDialogOpen(false);
      setReviewTarget(null);
      setFeedback('');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Course Submissions
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review student submissions and provide feedback.
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
        <Alert severity="info">No submissions yet for this course.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {submissions.map((sub) => {
            const cfg = statusConfig[sub.status] ?? statusConfig.submitted;
            return (
              <Card key={sub.submission_id} variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {sub.status === 'reviewed' ? (
                      <CheckCircle fontSize="small" color="success" />
                    ) : sub.status === 'returned' ? (
                      <Replay fontSize="small" color="info" />
                    ) : (
                      <SendIcon fontSize="small" color="warning" />
                    )}
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>
                      {sub.project_name}
                    </Typography>
                    <Chip label={cfg.label} color={cfg.color} size="small" />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Student: {sub.user_id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Submitted: {new Date(sub.submitted_at).toLocaleString()}
                  </Typography>
                  {sub.feedback && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Feedback:
                      </Typography>
                      <Typography variant="body2">{sub.feedback}</Typography>
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
                  <Button
                    size="small"
                    startIcon={<ReviewIcon />}
                    onClick={() => handleOpenReview(sub.submission_id, sub.project_name, sub.feedback)}
                  >
                    Review
                  </Button>
                </CardActions>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Review Dialog */}
      <Dialog
        open={reviewDialogOpen}
        onClose={reviewLoading ? undefined : () => setReviewDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Review: {reviewTarget?.projectName}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Feedback"
            multiline
            minRows={4}
            maxRows={12}
            fullWidth
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Status
            </Typography>
            <ToggleButtonGroup
              value={reviewStatus}
              exclusive
              onChange={(_, val) => val && setReviewStatus(val)}
              size="small"
            >
              <ToggleButton value="reviewed">
                <CheckCircle fontSize="small" sx={{ mr: 0.5 }} /> Reviewed
              </ToggleButton>
              <ToggleButton value="returned">
                <Replay fontSize="small" sx={{ mr: 0.5 }} /> Returned
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)} disabled={reviewLoading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmitReview} disabled={reviewLoading}>
            {reviewLoading ? 'Saving…' : 'Save Review'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default SubmissionsDashboard;
