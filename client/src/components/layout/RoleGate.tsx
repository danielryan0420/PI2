import type { Role } from '../../types';
import { useSession } from '../../context/SessionContext';

interface RoleGateProps {
  roles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  const { role } = useSession();
  if (!role || !roles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
