/**
 * Tiny API client.
 *  - Access token lives in memory only (module variable), never localStorage.
 *  - On 401 TOKEN_EXPIRED it calls /auth/refresh once (HttpOnly cookie) and
 *    retries; concurrent requests share the same in-flight refresh.
 *  - Errors are thrown as ApiError with the server's stable `code`.
 */
const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function onSessionExpired(cb: () => void) {
  onSessionLost = cb;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, body, credentials: 'include' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, init, false);
    onSessionLost();
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; details?: unknown; reference?: string } }).error;
    // Unexpected server errors carry a reference that matches the server log: show it so support can find it.
    const message = (e?.message ?? res.statusText) + (e?.reference ? ` (Reference: ${e.reference.slice(0, 8)})` : '');
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', message, e?.details);
  }
  return data as T;
}

/** Download a protected file (needs the Authorization header, so no plain <a href>). */
export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Absolute URL of an API path, for plain links that need no sign-in (public downloads). */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

export { refresh as tryRefreshSession };
