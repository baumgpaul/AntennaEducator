import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import { canUseFem } from '@/config/features';

/** Route guard for FEM Studio (preview): flag on and maintainer/admin, else home. */
function RequireFem({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.auth.user);
  if (!canUseFem(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default RequireFem;
