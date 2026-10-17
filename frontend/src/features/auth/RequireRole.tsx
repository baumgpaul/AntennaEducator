import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import type { User } from '@/types/models';

export type UserRole = 'user' | 'maintainer' | 'admin';

const ROLE_RANK: Record<UserRole, number> = { user: 0, maintainer: 1, admin: 2 };

/**
 * Effective role of a user. The backend's `role` is authoritative; the legacy
 * `is_admin` flag is only used when `role` is missing (older profiles).
 */
export function effectiveRole(user: User | null | undefined): UserRole | null {
  if (!user) return null;
  if (user.role) return user.role;
  return user.is_admin ? 'admin' : 'user';
}

/** True if the user has at least `minRole` (admin ⊃ maintainer ⊃ user). */
export function hasRole(user: User | null | undefined, minRole: UserRole): boolean {
  const role = effectiveRole(user);
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minRole];
}

interface RequireRoleProps {
  role: UserRole;
  children: React.ReactNode;
}

/**
 * Route guard for role-restricted pages. Must be nested inside ProtectedRoute
 * (authentication is checked there). The backend enforces roles too — this
 * only keeps unauthorized users from seeing the page at all.
 */
function RequireRole({ role, children }: RequireRoleProps) {
  const user = useAppSelector((state) => state.auth.user);

  if (!hasRole(user, role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default RequireRole;
