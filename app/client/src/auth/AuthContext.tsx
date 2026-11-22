/**
 * Session state for the SPA. On load it silently tries the refresh cookie, so
 * a returning user stays signed in without the token ever touching storage.
 * `can(permission)` mirrors the server's RBAC for showing/hiding UI — the
 * server still enforces everything.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired, setAccessToken, tryRefreshSession } from '../lib/api';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone: string;
  status: string;
  /** null until the welcome tour is finished or skipped */
  tourCompletedAt: string | null;
  preferences: { emailOnMessage: boolean; emailReminders: boolean };
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  reload(): Promise<void>;
  can(permission: string): boolean;
  canAny(...permissions: string[]): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setUser(await api<SessionUser>('/auth/me'));
  }, []);

  useEffect(() => {
    onSessionExpired(() => {
      setAccessToken(null);
      setUser(null);
    });
    (async () => {
      if (await tryRefreshSession()) await reload().catch(() => setUser(null));
      setLoading(false);
    })();
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: SessionUser }>('/auth/login', { method: 'POST', json: { email, password } });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const perms = new Set(user?.permissions ?? []);
    return {
      user,
      loading,
      login,
      logout,
      reload,
      can: (p) => perms.has(p),
      canAny: (...ps) => ps.some((p) => perms.has(p)),
    };
  }, [user, loading, login, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
