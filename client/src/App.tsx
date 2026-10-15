/**
 * Routing + navigation. Every menu entry and route is gated by PERMISSIONS
 * (never role names), so custom roles created in the admin UI get a sensible
 * app automatically — e.g. a "Parent observer" with only sessions:view_feed
 * sees just the Session Feed.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Can, RequireAuth, RequirePermission } from './auth/guards';
import { useApi } from './components/ui';
import type { PublicConfig } from './lib/types';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { SessionFeedPage } from './pages/SessionFeedPage';
import { BookPage } from './pages/BookPage';
import { BookingsPage } from './pages/BookingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { ClassesPage } from './pages/ClassesPage';
import { ProfilePage } from './pages/ProfilePage';
import { BillingPage } from './pages/BillingPage';
import { ApprovalsPage } from './pages/admin/ApprovalsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { RolesPage } from './pages/admin/RolesPage';
import { ServicesPage } from './pages/admin/ServicesPage';
import { AuditPage } from './pages/admin/AuditPage';

function Shell() {
  const { user, logout, canAny } = useAuth();
  const config = useApi<PublicConfig>('/config');
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const isStaff = canAny('users:read', 'users:approve', 'roles:manage', 'services:manage', 'audit:read');

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">MindAccel</NavLink>
        <button className="link menu-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>☰ Menu</button>
        <nav id="main-nav" className={open ? 'open' : ''}>
          <NavLink to="/" end>Home</NavLink>
          <Can permission="sessions:view_feed"><NavLink to="/sessions">Sessions</NavLink></Can>
          <Can permission="bookings:create"><NavLink to="/book">Book</NavLink></Can>
          <Can permission={['bookings:read_own', 'bookings:read_any']}><NavLink to="/bookings">Bookings</NavLink></Can>
          <Can permission={['availability:manage_own', 'availability:manage_any']}><NavLink to="/availability">Availability</NavLink></Can>
          <Can permission={['resources:read_assigned', 'resources:create', 'resources:manage_any']}><NavLink to="/resources">Resources</NavLink></Can>
          <Can permission="groups:manage"><NavLink to="/classes">Classes</NavLink></Can>
          {config.data?.billingEnabled && <Can permission="billing:read_own"><NavLink to="/billing">Billing</NavLink></Can>}
          {isStaff && <span className="nav-sep" aria-hidden />}
          <Can permission="users:approve"><NavLink to="/admin/approvals">Approvals</NavLink></Can>
          <Can permission="users:read"><NavLink to="/admin/users">Users</NavLink></Can>
          <Can permission="services:manage"><NavLink to="/admin/services">Services</NavLink></Can>
          <Can permission="roles:manage"><NavLink to="/admin/roles">Roles</NavLink></Can>
          <Can permission="audit:read"><NavLink to="/admin/audit">Audit</NavLink></Can>
          <span className="spacer" />
          <NavLink to="/profile">{user?.firstName}</NavLink>
          <button className="link" onClick={logout}>Sign out</button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const gate = (any: string[], element: ReactElement) => <Route element={<RequirePermission any={any} />}>{element}</Route>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {gate(['sessions:view_feed'], <Route path="/sessions" element={<SessionFeedPage />} />)}
          {gate(['bookings:create'], <Route path="/book" element={<BookPage />} />)}
          {gate(['bookings:read_own', 'bookings:read_any'], <Route path="/bookings" element={<BookingsPage />} />)}
          {gate(['availability:manage_own', 'availability:manage_any'], <Route path="/availability" element={<AvailabilityPage />} />)}
          {gate(['resources:read_assigned', 'resources:create', 'resources:manage_any'], <Route path="/resources" element={<ResourcesPage />} />)}
          {gate(['groups:manage'], <Route path="/classes" element={<ClassesPage />} />)}
          {gate(['billing:read_own'], <Route path="/billing" element={<BillingPage />} />)}
          {gate(['users:approve'], <Route path="/admin/approvals" element={<ApprovalsPage />} />)}
          {gate(['users:read'], <Route path="/admin/users" element={<UsersPage />} />)}
          {gate(['services:manage'], <Route path="/admin/services" element={<ServicesPage />} />)}
          {gate(['roles:manage'], <Route path="/admin/roles" element={<RolesPage />} />)}
          {gate(['audit:read'], <Route path="/admin/audit" element={<AuditPage />} />)}
          <Route path="*" element={<section><h1>Page not found</h1></section>} />
        </Route>
      </Route>
    </Routes>
  );
}
