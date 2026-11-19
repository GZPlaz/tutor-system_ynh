/**
 * The front door. Visitors land here and the default is "Create your
 * account" — signing in is one click away for people who already have one.
 * The left panel is the brand moment (graph-paper notebook in the brand
 * colour); everything it says comes from the admin's Branding settings.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Button, ErrorText, errorMessage } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useBranding } from '../lib/branding';
import { usePublicConfig } from '../lib/config';
import { MaintenanceBanner } from '../components/MaintenanceBanner';
import { allTimeZones, browserTimeZone } from '../lib/time';

const stepsFor = (approval: boolean) => [
  'Create your account',
  approval ? 'We approve it, usually within a day' : 'Sign in straight away',
  'Book your first session',
];

export function AuthLayout({ children }: { children: ReactNode }) {
  const { branding } = useBranding();
  const config = usePublicConfig();
  const STEPS = stepsFor(config?.registrationNeedsApproval ?? true);
  return (
    <div className="welcome">
      <section className={`welcome-panel ${branding.pattern ? 'pattern' : ''}`}>
        <Brand />
        <div className="welcome-copy">
          <h1 className="welcome-headline">{branding.headline}</h1>
          {branding.intro && <p className="welcome-intro">{branding.intro}</p>}
          {branding.highlights.length > 0 && (
            <ul className="welcome-highlights">
              {branding.highlights.map((h) => (
                <li key={h}>
                  <Icon name="check" size={18} /> {h}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ol className="welcome-steps" aria-label="How it works">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="step-num">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>
      <section className="welcome-form">
        <div className="welcome-form-inner">
          <MaintenanceBanner />
          {children}
        </div>
      </section>
    </div>
  );
}

function ModeSwitch({ mode }: { mode: 'register' | 'login' }) {
  const config = usePublicConfig();
  if (config && !config.registrationOpen) return null; // invitation only: nothing to switch to
  return (
    <div className="mode-switch" role="tablist" aria-label="Account">
      <Link to="/register" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''}>
        Create account
      </Link>
      <Link to="/login" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''}>
        Sign in
      </Link>
    </div>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  ACCOUNT_PENDING: "Your account is waiting for approval. We'll email you as soon as it's ready — usually within a day.",
  ACCOUNT_REJECTED: "We weren't able to approve this account. Reply to our email if you think that's a mistake.",
  ACCOUNT_SUSPENDED: 'This account is paused. Please contact us to reactivate it.',
  ACCOUNT_LOCKED: 'Too many attempts. Wait 15 minutes, then try again.',
  INVALID_CREDENTIALS: "That email and password don't match. Check for typos, or reset your password.",
};

export function LoginPage() {
  const config = usePublicConfig();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(f.get('email')), String(f.get('password')));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? (STATUS_MESSAGES[err.code] ?? err.message) : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <ModeSwitch mode="login" />
      <h2 className="form-title">Welcome back</h2>
      <form onSubmit={onSubmit} className="form">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          <span className="row-between">
            Password <Link to="/forgot-password" className="small-link">Forgot it?</Link>
          </span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button className="block" busy={busy}>Sign in</Button>
      </form>
      {config?.registrationOpen !== false && (
        <p className="form-foot">
          New here? <Link to="/register">Create an account</Link> — it takes a minute.
        </p>
      )}
      {config?.guestBooking && (
        <p className="form-foot">
          Just want to book a session? <Link to="/book">Book without an account</Link>.
        </p>
      )}
      <p className="form-foot">
        Studying on your own? <Link to="/packets">Get our free study packets</Link>.
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { user } = useAuth();
  const { branding } = useBranding();
  const config = usePublicConfig();
  const [done, setDone] = useState<{ name: string; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await api<{ status: string }>('/auth/register', { method: 'POST', json: f });
      setDone({ name: f.firstName ?? '', status: res.status });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(Object.fromEntries((err.details as { field: string; message: string }[]).map((d) => [d.field.replace('body.', ''), d.message])));
        setError('Please check the highlighted fields.');
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setError('That email already has an account. Sign in instead, or reset your password.');
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (config && !config.registrationOpen) {
    return (
      <AuthLayout>
        <h2 className="form-title">Accounts are by invitation</h2>
        <p>New accounts aren't open to the public right now. If you were invited, use the link in your invitation email.</p>
        {branding.supportEmail && <p className="muted">Questions? Email <a href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>.</p>}
        <div className="button-row">
          <Link to="/login" className="btn primary">Sign in</Link>
          {config.guestBooking && <Link to="/book" className="btn secondary">Book a session</Link>}
        </div>
      </AuthLayout>
    );
  }

  if (done !== null) {
    const approved = done.status === 'ACTIVE';
    return (
      <AuthLayout>
        <div className="done">
          <div className="done-icon"><Icon name="check" size={28} /></div>
          <h2 className="form-title">{approved ? `Welcome${done.name ? `, ${done.name}` : ''}!` : `You're on the list${done.name ? `, ${done.name}` : ''}!`}</h2>
          {approved ? (
            <p>Your account is ready. Sign in to book your first session.</p>
          ) : (
            <p>We check every new account by hand. You'll get an email as soon as yours is approved — usually within a day. Then you can sign in and book your first session.</p>
          )}
          {branding.supportEmail && (
            <p className="muted">
              Questions? Email <a href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a>.
            </p>
          )}
          <Link to="/login" className="btn secondary">Go to sign in</Link>
        </div>
      </AuthLayout>
    );
  }

  const err = (k: string) => fieldErrors[k] && <small className="field-error">{fieldErrors[k]}</small>;
  return (
    <AuthLayout>
      <ModeSwitch mode="register" />
      <h2 className="form-title">Create your account</h2>
      <p className="form-lead">Free to join. Sign up as a student, or on behalf of your child.</p>
      {config && config.allowedEmailDomains.length > 0 && (
        <p className="hint">Sign-up is limited to email addresses from: {config.allowedEmailDomains.join(', ')}.</p>
      )}
      <form onSubmit={onSubmit} className="form" noValidate>
        <div className="form-row">
          <label className="field">
            <span>First name</span>
            <input name="firstName" autoComplete="given-name" required aria-invalid={!!fieldErrors.firstName} />
            {err('firstName')}
          </label>
          <label className="field">
            <span>Last name</span>
            <input name="lastName" autoComplete="family-name" required aria-invalid={!!fieldErrors.lastName} />
            {err('lastName')}
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
          {err('email')}
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="new-password" minLength={10} required aria-invalid={!!fieldErrors.password} />
          {err('password') || <small className="hint">At least 10 characters, with a letter and a number.</small>}
        </label>
        <label className="field">
          <span>Your time zone</span>
          <select name="timezone" defaultValue={browserTimeZone()}>
            {allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}
          </select>
          <small className="hint">We show every session time in this zone. We've guessed it from your device.</small>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button className="block" busy={busy}>Create account</Button>
      </form>
      <p className="form-foot">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
      {config?.guestBooking && (
        <p className="form-foot">
          Just want to book a session? <Link to="/book">Book without an account</Link>.
        </p>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout>
      <h2 className="form-title">Reset your password</h2>
      {sent ? (
        <>
          <p>If that email has an account, a reset link is on its way. Check your inbox (and spam folder).</p>
          <Link to="/login" className="btn secondary">Back to sign in</Link>
        </>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await api('/auth/forgot-password', { method: 'POST', json: { email: new FormData(e.currentTarget).get('email') } }).catch(() => undefined);
            setBusy(false);
            setSent(true);
          }}
        >
          <p className="form-lead">Enter your email and we'll send you a link to choose a new password.</p>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <Button className="block" busy={busy}>Send reset link</Button>
          <p className="form-foot"><Link to="/login">Back to sign in</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}

/** Used for password resets and for staff invitations ("choose a password"). */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout>
      <h2 className="form-title">Choose a password</h2>
      {msg ? (
        <>
          <p>{msg}</p>
          <Link to="/login" className="btn primary">Sign in</Link>
        </>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/auth/reset-password', {
                method: 'POST',
                json: { token: params.get('token'), password: new FormData(e.currentTarget).get('password') },
              });
              setMsg('Your password is saved. You can sign in now.');
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>New password</span>
            <input name="password" type="password" minLength={10} autoComplete="new-password" required />
            <small className="hint">At least 10 characters, with a letter and a number.</small>
          </label>
          <ErrorText>{error}</ErrorText>
          <Button className="block" busy={busy}>Save password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
