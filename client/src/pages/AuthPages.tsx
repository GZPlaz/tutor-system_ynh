/**
 * Public pages: sign in, register (→ pending approval), reset/set password.
 * Login errors with code ACCOUNT_PENDING / ACCOUNT_REJECTED / ACCOUNT_SUSPENDED
 * get a dedicated message instead of a generic failure.
 */
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { allTimeZones, browserTimeZone } from '../lib/time';

const STATUS_MESSAGES: Record<string, string> = {
  ACCOUNT_PENDING: 'Your account is waiting for administrator approval. You will receive an email as soon as it is approved.',
  ACCOUNT_REJECTED: 'Your registration was not approved. Please contact us if you think this is a mistake.',
  ACCOUNT_SUSPENDED: 'Your account is suspended. Please contact MindAccel support.',
  ACCOUNT_LOCKED: 'Too many failed attempts. Please wait a few minutes and try again.',
};

function errorText(err: unknown) {
  if (err instanceof ApiError) return STATUS_MESSAGES[err.code] ?? err.message;
  return 'Something went wrong. Please try again.';
}

export function LoginPage() {
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
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>Sign in</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted">
        New student? <Link to="/register">Create an account</Link> · <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  );
}

export function RegisterPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError(null);
    setFieldErrors({});
    try {
      await api('/auth/register', { method: 'POST', json: f });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(Object.fromEntries((err.details as { field: string; message: string }[]).map((d) => [d.field.replace('body.', ''), d.message])));
      }
      setError(errorText(err));
    }
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1>Thanks for registering!</h1>
        <p>{STATUS_MESSAGES.ACCOUNT_PENDING}</p>
        <Link to="/login">Back to sign in</Link>
      </div>
    );
  }

  const fe = (k: string) => fieldErrors[k] && <small className="error">{fieldErrors[k]}</small>;
  return (
    <div className="auth-card">
      <h1>Create a student account</h1>
      <form onSubmit={onSubmit} className="stack">
        <div className="row">
          <label>First name<input name="firstName" required />{fe('firstName')}</label>
          <label>Last name<input name="lastName" required />{fe('lastName')}</label>
        </div>
        <label>Email<input name="email" type="email" required />{fe('email')}</label>
        <label>Password<input name="password" type="password" minLength={10} autoComplete="new-password" required />{fe('password')}</label>
        <label>
          Your timezone
          <select name="timezone" defaultValue={browserTimeZone()}>
            {allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}
          </select>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button>Register</button>
      </form>
      <p className="muted">New accounts are reviewed by an administrator before first sign-in.</p>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return (
    <div className="auth-card">
      <h1>Reset your password</h1>
      {sent ? (
        <p>If that email is registered, a reset link is on its way.</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await api('/auth/forgot-password', { method: 'POST', json: { email: new FormData(e.currentTarget).get('email') } });
            setSent(true);
          }}
        >
          <label>Email<input name="email" type="email" required /></label>
          <button>Send reset link</button>
        </form>
      )}
    </div>
  );
}

/** Used for both password resets and staff invitations ("set your password"). */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="auth-card">
      <h1>Choose a password</h1>
      {msg ? (
        <p>{msg} <Link to="/login">Sign in</Link></p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await api<{ message: string }>('/auth/reset-password', {
                method: 'POST',
                json: { token: params.get('token'), password: new FormData(e.currentTarget).get('password') },
              });
              setMsg(res.message);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <label>New password<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label>
          {error && <p className="error">{error}</p>}
          <button>Save password</button>
        </form>
      )}
    </div>
  );
}
