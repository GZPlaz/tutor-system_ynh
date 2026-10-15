/**
 * Route + element guards driven by permissions (not role names), so custom
 * roles created in the admin UI automatically get the right screens.
 *
 *   <Route element={<RequireAuth />}> ...protected routes... </Route>
 *   <Route element={<RequirePermission any={['users:approve']} />}> ... </Route>
 *   <Can permission="sessions:post_link"><button>Post link</button></Can>
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
