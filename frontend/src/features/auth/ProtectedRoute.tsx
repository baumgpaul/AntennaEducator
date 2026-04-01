import { Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { validateSession } from '@/store/authSlice';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Ensures user is authenticated before accessing routes
 * On first load with stored tokens, validates the session server-side
 * (token refresh) before rendering protected content. This prevents the
 * user from briefly seeing the app and then being kicked to login.
 */
function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, sessionValidated } = useAppSelector((state) => state.auth);
  const location = useLocation();
  const dispatch = useAppDispatch();

  // On mount, if we restored auth from localStorage but haven't validated
  // the session yet, trigger a server-side token validation (refresh).
  useEffect(() => {
    if (isAuthenticated && !sessionValidated) {
      dispatch(validateSession());
    }
  }, [isAuthenticated, sessionValidated, dispatch]);

  // Session restored from storage but not yet validated — show a loading spinner
  if (isAuthenticated && !sessionValidated) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          width: '100vw',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Verifying session…
        </Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the attempted location
    // User will be redirected back after successful login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
