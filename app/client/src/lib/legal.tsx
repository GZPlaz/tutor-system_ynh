/**
 * Shared pieces for the legal side of the site: the operator details (Admin →
 * Settings → Legal, with sensible fallbacks), the "I agree" controls used at
 * sign-up and when booking without an account, and the footer links.
 */
import { Link } from 'react-router-dom';
import { useBranding } from './branding';
import { usePublicConfig } from './config';
import type { LegalInfo } from './types';

export type AgeConfirmation = 'adult' | 'guardian';
export interface Consent {
  accepted: boolean;
  age: AgeConfirmation | '';
}
export const NO_CONSENT: Consent = { accepted: false, age: '' };
export const consentComplete = (c: Consent) => c.accepted && c.age !== '';
export const consentBody = (c: Consent) => ({ acceptTerms: c.accepted, age: c.age || undefined });

export interface ResolvedLegal extends LegalInfo {
  /** Who "we" are: the legal name, or the site name until one is filled in. */
  who: string;
  siteName: string;
  email: string;
}

const FALLBACK: LegalInfo = {
  operatorName: '', contactEmail: '', postalAddress: '', governingLaw: '', minimumAge: 13, parentalConsentAge: 18,
  effectiveDate: '2026-11-22', termsVersion: '1', additionalTerms: '',
};

export function useLegal(): ResolvedLegal {
  const config = usePublicConfig();
  const { branding } = useBranding();
  const l = config?.legal ?? FALLBACK;
  return {
    ...l,
    who: l.operatorName || branding.siteName,
    siteName: branding.siteName,
    email: l.contactEmail || branding.supportEmail,
  };
}

export const LEGAL_DOCS = [
  { slug: 'terms', title: 'Terms of Service' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'cookies', title: 'Cookie Policy' },
  { slug: 'safeguarding', title: 'Safeguarding Policy' },
  { slug: 'accessibility', title: 'Accessibility' },
] as const;
export type LegalSlug = (typeof LEGAL_DOCS)[number]['slug'];

/** The agreement checkbox and age confirmation. Links open in a new tab so a half-filled form isn't lost. */
export function ConsentControls({ value, onChange, action = 'creating an account' }: { value: Consent; onChange: (c: Consent) => void; action?: string }) {
  const legal = useLegal();
  const adultAge = legal.parentalConsentAge;
  return (
    <fieldset className="consent">
      <legend className="sr-only">Agreement</legend>
      <label className="check consent-check">
        <input type="checkbox" checked={value.accepted} onChange={(e) => onChange({ ...value, accepted: e.target.checked })} required />
        <span>
          I have read and agree to the{' '}
          <a href="/legal/terms" target="_blank" rel="noopener">Terms of Service</a> and{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
        </span>
      </label>
      <div className="consent-age" role="radiogroup" aria-label="Age">
        <label className="check">
          <input type="radio" name="consent-age" checked={value.age === 'adult'} onChange={() => onChange({ ...value, age: 'adult' })} />
          <span>I am {adultAge} or older</span>
        </label>
        <label className="check">
          <input type="radio" name="consent-age" checked={value.age === 'guardian'} onChange={() => onChange({ ...value, age: 'guardian' })} />
          <span>I am a parent or guardian {action} for my child, or the student is under {adultAge} and their parent or guardian agrees</span>
        </label>
      </div>
      {legal.minimumAge > 0 && (
        <small className="hint">Students under {legal.minimumAge} must be signed up by a parent or guardian.</small>
      )}
    </fieldset>
  );
}

export function LegalFooter({ compact }: { compact?: boolean }) {
  const legal = useLegal();
  return (
    <footer className={`legal-footer ${compact ? 'compact' : ''}`}>
      <nav aria-label="Legal">
        {LEGAL_DOCS.map((d) => <Link key={d.slug} to={`/legal/${d.slug}`}>{d.title}</Link>)}
      </nav>
      <span>© {new Date().getFullYear()} {legal.who}</span>
    </footer>
  );
}
