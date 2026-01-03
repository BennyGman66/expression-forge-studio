import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { LeapfrogLoader } from '@/components/ui/LeapfrogLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
  requireAnyRole?: boolean; // If true, user needs any of the roles. If false, user needs all roles.
}

export function ProtectedRoute({ 
  children, 
  requiredRoles = [], 
  requireAnyRole = true 
}: ProtectedRouteProps) {
  const { user, roles, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LeapfrogLoader />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check role requirements
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAnyRole
      ? requiredRoles.some(role => roles.includes(role))
      : requiredRoles.every(role => roles.includes(role));

    if (!hasRequiredRoles) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}
