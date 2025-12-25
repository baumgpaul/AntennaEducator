import { useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { logout } from '@/store/authSlice';
import { showWarning } from '@/store/uiSlice';
import { useNavigate } from 'react-router-dom';

/**
 * Session timeout configuration (in milliseconds)
 */
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000; // 5 minutes before timeout

/**
 * Activity events to track for session keepalive
 */
const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keypress',
  'scroll',
  'touchstart',
  'click',
];

/**
 * Hook for managing user session timeout
 * Automatically logs out user after period of inactivity
 */
export function useSessionTimeout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const handleLogout = useCallback(() => {
    dispatch(logout());
    navigate('/login');
  }, [dispatch, navigate]);

  const showTimeoutWarning = useCallback(() => {
    dispatch(showWarning('Your session will expire soon due to inactivity. Please interact with the page to stay logged in.'));
  }, [dispatch]);

  const resetTimeout = useCallback(() => {
    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
    }

    // Only set new timers if user is authenticated
    if (isAuthenticated) {
      // Set warning timer
      warningRef.current = setTimeout(() => {
        showTimeoutWarning();
      }, SESSION_TIMEOUT - WARNING_BEFORE_TIMEOUT);

      // Set logout timer
      timeoutRef.current = setTimeout(() => {
        handleLogout();
      }, SESSION_TIMEOUT);

      lastActivityRef.current = Date.now();
    }
  }, [isAuthenticated, handleLogout, showTimeoutWarning]);

  const handleActivity = useCallback(() => {
    // Throttle activity tracking - only reset if > 1 minute since last activity
    const now = Date.now();
    if (now - lastActivityRef.current > 60000) {
      resetTimeout();
    }
  }, [resetTimeout]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear timers when not authenticated
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      return;
    }

    // Set initial timeout
    resetTimeout();

    // Add activity listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, resetTimeout, handleActivity]);

  return {
    resetTimeout,
    lastActivity: lastActivityRef.current,
  };
}

export default useSessionTimeout;
