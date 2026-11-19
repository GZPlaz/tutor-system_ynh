/**
 * Minimal page frame for people who are not signed in but are allowed in:
 * booking without an account, and the private page for a guest's booking.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from './Shell';
import { MaintenanceBanner } from './MaintenanceBanner';
import { usePublicConfig } from '../lib/config';

export function PublicFrame({ children }: { children: ReactNode }) {
  const config = usePublicConfig();
  return (
    <div className="public-frame">
      <header className="public-bar">
        <Link to="/" aria-label="Home"><Brand /></Link>
        <nav className="public-links" aria-label="Account">
          <Link to="/login">Sign in</Link>
          {config?.registrationOpen && <Link to="/register" className="btn secondary">Create account</Link>}
        </nav>
      </header>
      <MaintenanceBanner />
      <main className="public-main">{children}</main>
    </div>
  );
}
