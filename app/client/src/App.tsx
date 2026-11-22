/**
 * Routes. Every signed-in route is gated by a permission (never a role name),
 * so custom roles get exactly the screens they need. Old URLs redirect.
 */
import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BookShell, RequireAuth, RequirePermission } from './auth/guards';
import { Shell } from './components/Shell';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/WelcomePage';
import { HomePage } from './pages/HomePage';
import { SessionsPage } from './pages/SessionsPage';
import { BookPage } from './pages/BookPage';
import { GuestBookingPage } from './pages/GuestBookingPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { ClassesPage } from './pages/ClassesPage';
import { ProfilePage } from './pages/ProfilePage';
import { PeoplePage } from './pages/admin/PeoplePage';
import { ServicesPage } from './pages/admin/ServicesPage';
import { RolesPage } from './pages/admin/RolesPage';
import { BrandingPage } from './pages/admin/BrandingPage';
import { ActivityPage } from './pages/admin/ActivityPage';
import { PacketsAdminPage } from './pages/admin/PacketsAdminPage';
import { PacketsPage } from './pages/PacketsPage';
import { MessagesPage } from './pages/MessagesPage';
import { Empty } from './components/ui';

const gate = (any: string[], element: ReactElement) => <Route element={<RequirePermission any={any} />}>{element}</Route>;

export default function App() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/booking/:id" element={<GuestBookingPage />} />
      {/* Free study packets: open to everyone, signed in or not. */}
      <Route path="/packets" element={<PacketsPage />} />

      {/* Booking works signed-in, or without an account when Admin → Settings allows it. */}
      <Route element={<BookShell />}>
        <Route path="/book" element={<BookPage />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {gate(['sessions:view_feed'], <Route path="/sessions" element={<SessionsPage />} />)}
          {gate(['messages:send', 'messages:read_any'], <Route path="/messages" element={<MessagesPage />} />)}
          {gate(['availability:manage_own', 'availability:manage_any'], <Route path="/availability" element={<AvailabilityPage />} />)}
          {gate(['resources:read_assigned', 'resources:create', 'resources:manage_any'], <Route path="/resources" element={<ResourcesPage />} />)}
          {gate(['groups:manage'], <Route path="/classes" element={<ClassesPage />} />)}
          {gate(['users:read', 'users:approve'], <Route path="/admin/people" element={<PeoplePage />} />)}
          {gate(['services:manage'], <Route path="/admin/services" element={<ServicesPage />} />)}
          {gate(['packets:manage'], <Route path="/admin/packets" element={<PacketsAdminPage />} />)}
          {gate(['roles:manage'], <Route path="/admin/roles" element={<RolesPage />} />)}
          {gate(['settings:manage'], <Route path="/admin/settings" element={<SettingsPage />} />)}
          {gate(['settings:manage'], <Route path="/admin/branding" element={<BrandingPage />} />)}
          {gate(['audit:read'], <Route path="/admin/activity" element={<ActivityPage />} />)}

          {/* Addresses from the previous version (and older emails) */}
          <Route path="/bookings" element={<Navigate to="/sessions" replace />} />
          <Route path="/admin/approvals" element={<Navigate to="/admin/people?tab=pending" replace />} />
          <Route path="/admin/users" element={<Navigate to="/admin/people" replace />} />
          <Route path="/admin/audit" element={<Navigate to="/admin/activity" replace />} />
          {/* Payment pages were removed (everything is free); old links land somewhere useful. */}
          <Route path="/billing" element={<Navigate to="/" replace />} />
          <Route path="/admin/payments" element={<Navigate to="/admin/settings" replace />} />

          <Route path="*" element={<div className="page"><Empty icon="search" title="This page doesn't exist">Check the address, or use the menu.</Empty></div>} />
        </Route>
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
