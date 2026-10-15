/**
 * Small shared UI kit + data hooks. Deliberately dependency-free; swap for a
 * component library later without touching pages' data logic.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';

// ---- data ---------------------------------------------------------------------

/** GET `path` (re-runs when it changes). Returns data, error, loading and reload(). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const res = await api<T>(path);
      if (mine === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length) {
      return (e.details as { field: string; message: string }[]).map((d) => `${d.field.replace(/^(body|query|params)\./, '')}: ${d.message}`).join(' · ');
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** Wraps an async action with busy/error state: const [run, busy, err] = useAction(fn) */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      setError(null);
      try {
        await fn(...args);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return [run, busy, error, setError] as const;
}

// ---- components ---------------------------------------------------------------

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="muted">{what}…</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="error" role="alert">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="row between">
          <h2>{title}</h2>
          <button className="link" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'tab active' : 'tab'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  ACTIVE: 'good',
  PENDING: 'warn',
  SUSPENDED: 'bad',
  REJECTED: 'bad',
  CONFIRMED: 'info',
  COMPLETED: 'good',
  CANCELLED: 'neutral',
  NO_SHOW: 'bad',
};

/** Paged list response shape used by /users and /scheduling/bookings. */
export interface Paged<T> {
  total: number;
  items: T[];
}
