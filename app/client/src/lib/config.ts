/**
 * Public site settings (sign-ups open? approval needed? booking without an account?
 * maintenance?) from GET /api/config. Fetched once and shared; refreshed at most
 * every 30 s so a change an admin just saved reaches visitors quickly.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import type { PublicConfig } from './types';

let cache: { at: number; promise: Promise<PublicConfig> } | null = null;

export function loadConfig(force = false): Promise<PublicConfig> {
  if (force || !cache || Date.now() - cache.at > 30_000) {
    const promise = api<PublicConfig>('/config');
    cache = { at: Date.now(), promise };
    promise.catch(() => (cache = null));
  }
  return cache.promise;
}

/** `null` until the first answer arrives (or if the server can't be reached). */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => alive && setConfig(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
