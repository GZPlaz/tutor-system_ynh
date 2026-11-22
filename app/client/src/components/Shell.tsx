/**
 * Signed-in layout: sidebar navigation (drawer on phones) + page area.
 * Every link is gated by a permission, so custom roles get a sensible menu.
 * Badges use the accent ("highlighter") colour and mean: something is
 * waiting for you.
 */
import { TermsGate } from './TermsGate';
import { LegalFooter } from '../lib/legal';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { logoUrl, useBranding } from '../lib/branding';
import { api } from '../lib/api';
import { useMessageSummary } from '../lib/messages';
import { Icon, type IconName } from './Icon';
import { Avatar } from './ui';
import { MaintenanceBanner } from './MaintenanceBanner';
import { Tour } from './Tour';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  show: boolean;
  badge?: number;
  end?: boolean;
  forceActive?: boolean;
}

/** Pages grouped under "Settings" in the menu, shown as tabs at the top of each. */
export const SETTINGS_TABS = [
  { to: '/admin/settings', label: 'General', perm: 'settings:manage' },
  { to: '/admin/branding', label: 'Branding', perm: 'settings:manage' },
  { to: '/admin/roles', label: 'Roles & permissions', perm: 'roles:manage' },
  { to: '/admin/activity', label: 'Activity log', perm: 'audit:read' },
] as const;

export function SettingsTabs() {
  const { can } = useAuth();
  const tabs = SETTINGS_TABS.filter((t) => can(t.perm));
  return (
    <nav className="sub-tabs" aria-label="Settings sections">
      {tabs.map((t) => <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>{t.label}</NavLink>)}
    </nav>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  const { branding } = useBranding();
  const src = logoUrl(branding);
  return (
    <span className={`brand ${compact ? 'compact' : ''}`}>
      {src ? <img src={src} alt="" className="brand-logo" /> : <span className="brand-mark" aria-hidden>{branding.siteName.slice(0, 1)}</span>}
      <span className="brand-name">{branding.siteName}</span>
    </span>
  );
}

export function Shell() {
  const { user, logout, can, canAny } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ requests: 0, pending: 0, reports: 0 });
  const messages = useMessageSummary(canAny('messages:send', 'messages:read_any'));

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, p, r] = await Promise.all([
        can('sessions:run') ? api<{ requests: number }>('/sessions/counts').catch(() => null) : null,
        can('users:approve') ? api<{ total: number }>('/users?status=PENDING&pageSize=1').catch(() => null) : null,
        can('safety:manage') ? api<{ counts: Record<string, number> }>('/reports?status=OPEN').catch(() => null) : null,
      ]);
      if (!alive) return;
      setCounts({ requests: s?.requests ?? 0, pending: p?.total ?? 0, reports: r?.counts.OPEN ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, [location.pathname, can]);

  // The settings group (general, branding, roles, activity log) is one menu item with tabs.
  const inSettings = SETTINGS_TABS.some((t) => location.pathname.startsWith(t.to));
  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { to: '/', label: 'Home', icon: 'home', show: true, end: true },
        { to: '/sessions', label: 'Sessions', icon: 'calendar', show: can('sessions:view_feed'), badge: counts.requests },
        { to: '/calendar', label: 'Calendar', icon: 'calendarSync', show: can('sessions:view_feed') },
        { to: '/book', label: 'Book a session', icon: 'calendarPlus', show: can('bookings:create') },
        { to: '/messages', label: 'Messages', icon: 'message', show: canAny('messages:send', 'messages:read_any'), badge: messages.unread + messages.openQuestions.length },
        { to: '/resources', label: 'Resources', icon: 'book', show: canAny('resources:read_assigned', 'resources:create', 'resources:manage_any') },
        { to: '/packets', label: 'Free packets', icon: 'download', show: !can('packets:manage') },
      ],
    },
    {
      title: 'Teaching',
      items: [
        { to: '/availability', label: 'My hours', icon: 'clock', show: canAny('availability:manage_own', 'availability:manage_any') },
        { to: '/students', label: 'Students', icon: 'users', show: can('students:read_notes') },
        { to: '/classes', label: 'Classes', icon: 'layers', show: can('groups:manage') },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: '/admin/people', label: 'People', icon: 'user', show: canAny('users:manage', 'users:approve'), badge: counts.pending },
        { to: '/admin/reports', label: 'Reports', icon: 'alert', show: can('safety:manage'), badge: counts.reports },
        { to: '/admin/services', label: 'Subjects', icon: 'book', show: can('services:manage') },
        { to: '/admin/packets', label: 'Study packets', icon: 'file', show: can('packets:manage') },
        { to: '/admin/insights', label: 'Insights', icon: 'chart', show: can('reports:read') },
        { to: SETTINGS_TABS.find((t) => can(t.perm))?.to ?? '/admin/settings', label: 'Settings', icon: 'sliders', show: SETTINGS_TABS.some((t) => can(t.perm)), forceActive: inSettings },
      ],
    },
  ];

  const name = user ? `${user.firstName} ${user.lastName}` : '';

  return (
    <div className="shell">
      <header className="mobile-bar">
        <Brand compact />
        <button className="icon-btn" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)} aria-label="Menu">
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </header>

      <aside id="sidebar" className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="sidebar-brand">
          <Brand />
        </NavLink>
        <nav aria-label="Main">
          {groups.map((g, i) => {
            const visible = g.items.filter((it) => it.show);
            if (!visible.length) return null;
            return (
              <div key={i} className="nav-group">
                {g.title && <p className="nav-title">{g.title}</p>}
                {visible.map((it) => (
                  <NavLink key={it.label} to={it.to} end={it.end} className={({ isActive }) => `nav-link ${isActive || it.forceActive ? 'active' : ''}`} data-tour={it.to}>
                    <Icon name={it.icon} />
                    <span>{it.label}</span>
                    {!!it.badge && <span className="nav-badge" aria-label={`${it.badge} waiting`}>{it.badge}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/profile" className="me" data-tour="/profile">
            <Avatar name={name} size={34} />
            <span className="me-text">
              <strong>{name}</strong>
              <small>Your profile</small>
            </span>
          </NavLink>
          <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} />}

      {user?.legal.mustAcceptTerms ? <TermsGate /> : user && !user.tourCompletedAt && <Tour />}
      <main className="main">
        <MaintenanceBanner />
        {inSettings && <div className="page wide settings-tabs-wrap"><SettingsTabs /></div>}
        <Outlet />
        <LegalFooter compact />
      </main>
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
