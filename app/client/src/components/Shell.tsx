/**
 * Signed-in layout: sidebar navigation (drawer on phones) + page area.
 * Every link is gated by a permission, so custom roles get a sensible menu.
 * Badges use the accent ("highlighter") colour and mean: something is
 * waiting for you.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { logoUrl, useBranding } from '../lib/branding';
import { api } from '../lib/api';
import { Icon, type IconName } from './Icon';
import { Avatar } from './ui';
import { MaintenanceBanner } from './MaintenanceBanner';

interface Item {
  to: string;
  label: string;
  icon: IconName;
  show: boolean;
  badge?: number;
  end?: boolean;
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
  const [counts, setCounts] = useState({ requests: 0, pending: 0 });

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, p] = await Promise.all([
        can('sessions:run') ? api<{ requests: number }>('/sessions/counts').catch(() => null) : null,
        can('users:approve') ? api<{ total: number }>('/users?status=PENDING&pageSize=1').catch(() => null) : null,
      ]);
      if (!alive) return;
      setCounts({ requests: s?.requests ?? 0, pending: p?.total ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, [location.pathname, can]);

  const groups: { title?: string; items: Item[] }[] = [
    {
      items: [
        { to: '/', label: 'Home', icon: 'home', show: true, end: true },
        { to: '/sessions', label: 'Sessions', icon: 'calendar', show: can('sessions:view_feed'), badge: counts.requests },
        { to: '/book', label: 'Book a session', icon: 'calendarPlus', show: can('bookings:create') },
        { to: '/resources', label: 'Resources', icon: 'book', show: canAny('resources:read_assigned', 'resources:create', 'resources:manage_any') },
      ],
    },
    {
      title: 'Teaching',
      items: [
        { to: '/availability', label: 'My availability', icon: 'clock', show: canAny('availability:manage_own', 'availability:manage_any') },
        { to: '/classes', label: 'Classes', icon: 'users', show: can('groups:manage') },
      ],
    },
    {
      title: 'Admin',
      items: [
        { to: '/admin/people', label: 'People', icon: 'user', show: canAny('users:read', 'users:approve'), badge: counts.pending },
        { to: '/admin/services', label: 'Services', icon: 'layers', show: can('services:manage') },
        { to: '/admin/roles', label: 'Roles', icon: 'shield', show: can('roles:manage') },
        { to: '/admin/settings', label: 'Settings', icon: 'sliders', show: can('settings:manage') },
        { to: '/admin/branding', label: 'Branding', icon: 'palette', show: can('settings:manage') },
        { to: '/admin/activity', label: 'Activity log', icon: 'activity', show: can('audit:read') },
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
                  <NavLink key={it.to} to={it.to} end={it.end} className="nav-link">
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
          <NavLink to="/profile" className="me">
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

      <main className="main">
        <MaintenanceBanner />
        <Outlet />
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
