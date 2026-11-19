/**
 * Route + element guards driven by permissions (not role names), so custom
 * roles created in the admin UI automatically get the right screens.
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Loading } from '../components/ui';
import { PublicFrame } from '../components/PublicFrame';
import { Shell } from '../components/Shell';
import { usePublicConfig } from '../lib/config';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot"><Loading /></div>;
  if (!user) {
    // Visitors arriving at the front door see the sign-up page; deep links go to sign-in.
    return location.pathname === '/' ? <Navigate to="/register" replace /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RequirePermission({ any }: { any: string[] }) {
  const { canAny } = useAuth();
  return canAny(...any) ? <Outlet /> : <Navigate to="/" replace />;
}

export function Can({ permission, children, fallback = null }: { permission: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const { canAny } = useAuth();
  const list = Array.isArray(permission) ? permission : [permission];
  return <>{canAny(...list) ? children : fallback}</>;
}

/**
 * /book works with or without an account. Signed-in people get the normal app shell;
 * visitors get the plain public frame when the administrator allows booking without
 * an account, and are sent to sign in when not.
 */
export function BookShell() {
  const { user, loading, canAny } = useAuth();
  const config = usePublicConfig();
  const location = useLocation();
  if (loading || (!user && !config)) return <div className="boot"><Loading /></div>;
  if (user) return canAny('bookings:create') ? <Shell /> : <Navigate to="/" replace />;
  if (!config?.guestBooking) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <PublicFrame><Outlet /></PublicFrame>;
}
