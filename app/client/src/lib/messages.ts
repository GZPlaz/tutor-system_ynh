/**
 * One shared poller for the messages badge, so the menu, home page and session
 * cards don't each hit the server. Polls every 30 s while the tab is visible;
 * call `refreshMessageSummary()` after sending or reading to update at once.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import type { MessageSummary } from './types';

const EMPTY: MessageSummary = { unread: 0, openQuestions: [] };
let state: MessageSummary = EMPTY;
const listeners = new Set<(s: MessageSummary) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

export function refreshMessageSummary(): Promise<void> {
  inflight ??= api<MessageSummary>('/messages/summary')
    .then((s) => {
      state = s;
      listeners.forEach((l) => l(s));
    })
    .catch(() => undefined)
    .finally(() => (inflight = null));
  return inflight;
}

const tick = () => {
  if (document.visibilityState === 'visible') void refreshMessageSummary();
};

export function useMessageSummary(enabled: boolean): MessageSummary {
  const [s, set] = useState(state);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(set);
    if (listeners.size === 1) {
      void refreshMessageSummary();
      timer = setInterval(tick, 30_000);
      document.addEventListener('visibilitychange', tick);
    } else set(state);
    return () => {
      listeners.delete(set);
      if (listeners.size === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', tick);
        state = EMPTY;
      }
    };
  }, [enabled]);
  return enabled ? s : EMPTY;
}
