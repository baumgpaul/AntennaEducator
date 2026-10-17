import { useState } from 'react';
import { Box, Button, Container, Paper, Stack, Typography, Alert } from '@mui/material';
import { HourglassEmpty } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logoutAsync, updateUser } from '@/store/authSlice';
import { getAuthService } from '@/services/auth';

/**
 * Shown to signed-in users whose account an admin has not approved yet.
 * "Check again" re-reads the profile, so an approval takes effect without
 * logging out and in.
 */
function PendingApproval() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [checking, setChecking] = useState(false);
  const [stillPending, setStillPending] = useState(false);

  const handleCheckAgain = async () => {
    setChecking(true);
    try {
      const profile = await getAuthService().getCurrentUser();
      dispatch(updateUser(profile));
      setStillPending(profile.is_approved === false);
    } catch {
      setStillPending(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
          <HourglassEmpty color="primary" sx={{ fontSize: 48, mb: 1 }} />
          <Typography variant="h5" gutterBottom>
            Waiting for approval
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Your account{user?.email ? ` (${user.email})` : ''} has been created, but an
            administrator — usually your course instructor — has to approve it before you can
            use Antenna Educator.
          </Typography>
          {stillPending && (
            <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>
              Not approved yet. Please try again later or contact your instructor.
            </Alert>
          )}
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button variant="contained" onClick={handleCheckAgain} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </Button>
            <Button variant="outlined" onClick={() => dispatch(logoutAsync())}>
              Log out
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default PendingApproval;
