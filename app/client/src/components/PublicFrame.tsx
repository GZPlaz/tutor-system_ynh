/**
 * Minimal page frame for people who are not signed in but are allowed in:
 * booking without an account, the private page for a guest's booking, and the
 * free study packets. Signed-in people see a way back to their dashboard instead.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from './Shell';
import { MaintenanceBanner } from './MaintenanceBanner';
import { usePublicConfig } from '../lib/config';
import { useAuth } from '../auth/AuthContext';
import { LegalFooter } from '../lib/legal';

export function PublicFrame({ children, wide, footer = true }: { children: ReactNode; wide?: boolean; footer?: boolean }) {
  const config = usePublicConfig();
  const { user } = useAuth();
  return (
    <div className="public-frame">
      <header className="public-bar">
        <Link to="/" aria-label="Home"><Brand /></Link>
        <nav className="public-links" aria-label="Account">
          <Link to="/packets">Free packets</Link>
          {user ? (
            <Link to="/" className="btn secondary">Your dashboard</Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              {config?.registrationOpen && <Link to="/register" className="btn secondary">Create account</Link>}
            </>
          )}
        </nav>
      </header>
      <MaintenanceBanner />
      <main className={`public-main ${wide ? 'wide' : ''}`}>{children}</main>
      {footer && <LegalFooter />}
    </div>
  );
}
