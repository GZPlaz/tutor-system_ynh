/**
 * Welcome tour, shown once after someone's first sign-in (and again on request from
 * their profile). Each step points at a real menu item, so people learn where things
 * are, not just what exists. Steps depend on what the person can do: students learn to
 * book and join, tutors to set hours and run sessions, admins where the controls are.
 *
 * Finishing or skipping is saved on the account (not the browser), so it never reappears
 * on another device. Keyboard: → / Enter next, ← back, Esc close.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { useBranding } from '../lib/branding';
import { Button } from './ui';

interface Step {
  /** data-tour value of the element to point at; none = centred card */
  target?: string;
  title: string;
  body: string;
}

function stepsFor(can: (p: string) => boolean, canAny: (...p: string[]) => boolean, firstName: string, siteName: string): Step[] {
  const tutor = can('sessions:run') || can('availability:manage_own');
  const admin = canAny('services:manage', 'settings:manage', 'users:manage');
  const steps: (Step | false)[] = [
    {
      title: `Welcome to ${siteName}, ${firstName}`,
      body: tutor
        ? 'Here is a one-minute tour of where everything is. You can skip it, and restart it any time from your profile.'
        : 'Here is a one-minute tour: how to book a session, join it, and talk to your tutor. You can skip it, and restart it any time from your profile.',
    },
    can('availability:manage_own') && {
      target: '/availability',
      title: 'Start here: set your hours',
      body: 'Choose the times you can teach each week. Students can only book inside these hours, so nobody can book you until they are set.',
    },
    can('bookings:create') && {
      target: '/book',
      title: 'Book a session',
      body: 'Pick a subject, a tutor and a time that suits you. Your tutor confirms each request, and you get an email when they do.',
    },
    can('sessions:view_feed') && {
      target: '/sessions',
      title: tutor ? 'Run your sessions' : 'Your sessions',
      body: tutor
        ? 'New requests wait here for your OK. Once confirmed, add the Google Meet link, then start and end the session from the same card.'
        : 'Everything coming up is here. When your tutor adds the Google Meet link, a Join button appears (we email it to you too).',
    },
    can('messages:send') && {
      target: '/messages',
      title: 'Messages',
      body: tutor
        ? 'Talk privately with your students. On any upcoming session, "Ask a question" lets you find out what they need before you meet.'
        : 'Message your tutors any time. If a tutor asks you something before a session, it shows up here and on your home page.',
    },
    can('students:read_notes') && {
      target: '/students',
      title: 'Your students',
      body: "Open any student to see notes from every tutor, and add your own. Choose whether a note is for tutors only or visible to the student too.",
    },
    canAny('resources:read_assigned', 'resources:create') && {
      target: '/resources',
      title: tutor ? 'Share materials' : 'Your materials',
      body: tutor
        ? 'Upload worksheets, links and videos, then share them with a student or a whole class.'
        : 'Worksheets, links and videos your tutors share with you are kept here.',
    },
    !admin && {
      target: '/packets',
      title: 'Free study packets',
      body: 'Printable practice packets with answer keys, free for everyone. Great between sessions.',
    },
    can('services:manage') && {
      target: '/admin/services',
      title: 'Set up subjects',
      body: 'Admins: create the subjects people can book, and choose which tutors teach each one.',
    },
    can('users:manage') && {
      target: '/admin/people',
      title: 'People',
      body: 'Approve sign-ups and invite tutors. Open anyone to see their sessions, reports and activity, and to manage their account. Select several people for bulk actions.',
    },
    can('safety:manage') && {
      target: '/admin/reports',
      title: 'Reports',
      body: 'Reports about tutors arrive here (and by email). Review them, keep an internal note, and mark them resolved.',
    },
    can('settings:manage') && {
      target: '/admin/settings',
      title: 'Settings',
      body: 'Sign-up and booking rules, branding, roles and the activity log, all under one menu item.',
    },
    {
      target: '/profile',
      title: 'Your profile',
      body: 'Set your time zone (every time on the site and in emails uses it), choose which emails you get, and change your password. You can restart this tour here.',
    },
  ];
  return steps.filter(Boolean) as Step[];
}

export function Tour() {
  const { user, can, canAny, reload } = useAuth();
  const { branding } = useBranding();
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  const steps = user ? stepsFor(can, canAny, user.firstName, branding.siteName) : [];
  const step = steps[i];

  const finish = useCallback(async () => {
    setOpen(false);
    await api('/auth/me/tour', { method: 'POST', json: { done: true } }).catch(() => undefined);
    await reload().catch(() => undefined);
  }, [reload]);

  // Find the element this step points at; null if it isn't visible (phones: menu closed).
  const measure = useCallback(() => {
    const el = step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    setRect(r && r.width > 0 && r.left >= 0 && r.left < window.innerWidth ? r : null);
  }, [step?.target]);

  useLayoutEffect(() => {
    measure();
    card.current?.focus();
  }, [measure, i]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const last = i === steps.length - 1;
  const next = useCallback(() => (last ? void finish() : setI((n) => n + 1)), [last, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void finish();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, finish]);

  if (!open || !user || !step) return null;

  const pad = 6;
  const cardStyle = rect
    ? { position: 'fixed' as const, left: Math.min(rect.right + 18, window.innerWidth - 360), top: Math.max(16, Math.min(rect.top - 12, window.innerHeight - 260)) }
    : undefined;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {rect ? (
        <div className="tour-spotlight" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-backdrop" />
      )}
      <div ref={card} className={`tour-card ${rect ? 'anchored' : 'centred'}`} style={cardStyle} tabIndex={-1}>
        <p className="tour-progress">{i + 1} of {steps.length}</p>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">{step.body}</p>
        {step.target && !rect && <p className="tour-hint">Find it in the menu (☰ at the top).</p>}
        <div className="tour-actions">
          <button className="link-btn" onClick={() => void finish()}>{last ? 'Close' : 'Skip tour'}</button>
          <span className="spacer" />
          {i > 0 && <Button variant="secondary" onClick={back}>Back</Button>}
          <Button onClick={next}>{i === 0 ? 'Show me' : last ? 'Finish' : 'Next'}</Button>
        </div>
      </div>
    </div>
  );
}
