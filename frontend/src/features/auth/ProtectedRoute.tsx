import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Ensures user is authenticated before accessing routes
 * Redirects to login page if not authenticated, preserving the intended destination
 */
function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const location = useLocation();
  
  if (!isAuthenticated) {
    // Redirect to login, but save the attempted location
    // User will be redirected back after successful login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
}

export default ProtectedRoute;
