import { useSessionTimeout } from '@/hooks';

/**
 * SessionManager - Handles session timeout and activity tracking
 * This component has no UI - it just manages session logic
 */
function SessionManager() {
  useSessionTimeout();
  return null;
}

export default SessionManager;
