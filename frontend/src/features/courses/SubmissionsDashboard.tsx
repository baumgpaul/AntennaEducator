/**
 * SubmissionsDashboard — Instructor view of all submissions within a course.
 *
 * Groups submissions by student and shows all attempts per student in an
 * accordion. The most recent submission is highlighted with a "Latest" badge.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  RateReview as ReviewIcon,
  CheckCircle,
  Replay,
  Send as SendIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  Star as StarIcon,
  ArrowBack as BackIcon,
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
import { selectCourses } from '@/store/foldersSlice';

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
  const courses = useAppSelector(selectCourses);

  const courseName = useMemo(
    () => courses.find((c) => c.id === courseId)?.name ?? courseId,
    [courses, courseId],
  );

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

  // Group by user_id, sort each group newest-first
  const studentGroups = useMemo(() => {
    const grouped = new Map<string, { displayName: string; subs: typeof submissions }>();
    for (const sub of submissions) {
      if (!grouped.has(sub.user_id)) {
        grouped.set(sub.user_id, {
          displayName: sub.username || sub.user_id,
          subs: [],
        });
      }
      grouped.get(sub.user_id)!.subs.push(sub);
    }
    // Sort each student's submissions newest-first
    for (const group of grouped.values()) {
      group.subs.sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
      );
    }
    return Array.from(grouped.entries()).map(([userId, group]) => ({ userId, ...group }));
  }, [submissions]);

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
    <Box sx={{ p: 3, overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Button
          size="small"
          startIcon={<BackIcon />}
          onClick={() => navigate('/courses')}
          sx={{ mr: 1 }}
        >
          Courses
        </Button>
        <Typography variant="h5">Submissions</Typography>
        {courseName && (
          <Typography variant="h5" color="text.secondary">
            — {courseName}
          </Typography>
        )}
      </Box>
      {!loading && submissions.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {studentGroups.length} student{studentGroups.length !== 1 ? 's' : ''} ·{' '}
          {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : submissions.length === 0 ? (
        <Alert severity="info">No submissions yet for this course.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {studentGroups.map(({ userId, displayName, subs }) => {
            const latestStatus = subs[0]?.status ?? 'submitted';
            const latestCfg = statusConfig[latestStatus] ?? statusConfig.submitted;

            return (
              <Accordion key={userId} defaultExpanded disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, mr: 1 }}>
                    <PersonIcon color="action" fontSize="small" />
                    <Typography variant="subtitle1" sx={{ flex: 1 }}>
                      {displayName}
                    </Typography>
                    <Chip
                      label={`${subs.length} submission${subs.length !== 1 ? 's' : ''}`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip label={latestCfg.label} color={latestCfg.color} size="small" />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <List disablePadding>
                    {subs.map((sub, idx) => {
                      const cfg = statusConfig[sub.status] ?? statusConfig.submitted;
                      const isLatest = idx === 0;
                      return (
                        <ListItem
                          key={sub.submission_id}
                          divider
                          sx={{
                            bgcolor: isLatest ? 'primary.50' : undefined,
                            borderLeft: isLatest ? '3px solid' : '3px solid transparent',
                            borderLeftColor: isLatest ? 'primary.main' : 'transparent',
                            py: 1.5,
                            pl: 3,
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {isLatest && (
                                  <Tooltip title="Most recent submission">
                                    <StarIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                                  </Tooltip>
                                )}
                                {sub.status === 'reviewed' ? (
                                  <CheckCircle fontSize="small" color="success" />
                                ) : sub.status === 'returned' ? (
                                  <Replay fontSize="small" color="info" />
                                ) : (
                                  <SendIcon fontSize="small" color="warning" />
                                )}
                                <Typography variant="body2" fontWeight={isLatest ? 600 : 400}>
                                  {sub.project_name}
                                </Typography>
                                <Chip label={cfg.label} color={cfg.color} size="small" />
                                {isLatest && (
                                  <Chip label="Latest" size="small" color="primary" variant="outlined" />
                                )}
                              </Box>
                            }
                            secondary={
                              <Box component="span">
                                <Typography variant="caption" color="text.secondary">
                                  {new Date(sub.submitted_at).toLocaleString()}
                                </Typography>
                                {sub.feedback && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ display: 'block', mt: 0.5 }}
                                  >
                                    Feedback: {sub.feedback.length > 80 ? sub.feedback.slice(0, 80) + '…' : sub.feedback}
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                          <ListItemSecondaryAction>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                size="small"
                                startIcon={<ViewIcon />}
                                onClick={() =>
                                  navigate(`/submission/${sub.course_id}/${sub.submission_id}`)
                                }
                              >
                                View
                              </Button>
                              <Button
                                size="small"
                                startIcon={<ReviewIcon />}
                                onClick={() =>
                                  handleOpenReview(sub.submission_id, sub.project_name, sub.feedback)
                                }
                              >
                                Review
                              </Button>
                            </Box>
                          </ListItemSecondaryAction>
                        </ListItem>
                      );
                    })}
                  </List>
                </AccordionDetails>
              </Accordion>
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
        <DialogTitle>Review: {reviewTarget?.projectName}</DialogTitle>
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
