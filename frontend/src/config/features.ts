import { hasRole } from '@/features/auth/RequireRole';
import type { User } from '@/types/models';

/**
 * Build-time feature flags, set per deployment (terraform → SSM deploy config
 * → VITE_* at build). Vite replaces them with constants, so code behind a flag
 * that is off is dropped from the bundle: a production build without the flag
 * contains no trace of the feature (checked in CI, see pr-checks.yml).
 */

/** FEM Studio (preview): geometry → materials → physics → mesh → solve → results */
export const FEATURE_FEM = import.meta.env.VITE_FEATURE_FEM === 'true';

/** FEM is a preview: only in builds with the flag, and only for maintainers/admins. */
export function canUseFem(user: User | null | undefined): boolean {
  return FEATURE_FEM && hasRole(user, 'maintainer');
}
