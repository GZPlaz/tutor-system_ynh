/**
 * Home — "what do I need to know right now?"
 *  - the next session, big, with its main action
 *  - anything waiting on you (requests to confirm, people to approve)
 *  - the rest of the week, and newly shared materials
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Section } from '../components/Shell';
import { SessionCard } from '../components/SessionCard';
import { Empty, Loading, useApi, type Paged } from '../components/ui';
import { fmtDate, fmtTime } from '../lib/time';
import { useMessageSummary } from '../lib/messages';
import type { AvailabilityRule, Resource, Service, Session, UserRow } from '../lib/types';
import { useState } from 'react';

function greeting(tz?: string) {
  const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { user, can } = useAuth();
  const sessions = useApi<Session[]>(can('sessions:view_feed') ? '/sessions?view=upcoming&limit=20' : null);
  const pending = useApi<Paged<unknown>>(can('users:approve') ? '/users?status=PENDING&pageSize=1' : null);
  const resources = useApi<Resource[]>(can('resources:read_assigned') ? '/resources?view=assigned' : null);

  const msgs = useMessageSummary(can('messages:send'));
  const myHours = useApi<{ rules: AvailabilityRule[] }>(can('availability:manage_own') && user ? `/scheduling/availability/${user.id}` : null);
  const noHours = !!myHours.data && myHours.data.rules.length === 0;
  const sharedNotes = useApi<{ id: string; body: string; author: string; createdAt: string }[]>(can('bookings:create') ? '/students/me/notes' : null);
  const items = sessions.data ?? [];
  const requests = items.filter((s) => s.actions.confirm);
  const scheduled = items.filter((s) => !s.actions.confirm);
  const next = scheduled[0];
  const later = scheduled.slice(1, 5);
  const newest = [...(resources.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);

  return (
    <div className="page">
      <header className="home-hello">
        <h1>{greeting(user?.timezone)}, {user?.firstName}.</h1>
      </header>

      {can('services:manage') && <SetupChecklist />}

      {(noHours || requests.length > 0 || (pending.data?.total ?? 0) > 0 || msgs.unread > 0 || msgs.openQuestions.length > 0) && (
        <div className="attention-list">
          {noHours && (
            <Link to="/availability" className="attention-link">
              <Icon name="clock" />
              <span><strong>Set your weekly hours</strong> so students can book you. Until then nobody can.</span>
              <Icon name="chevronRight" />
            </Link>
          )}
          {msgs.openQuestions.map((q) => (
            <Link key={q.messageId} to={`/messages?c=${q.conversationId}`} className="attention-link">
              <Icon name="help" />
              <span><strong>{q.tutorName} asked you a question</strong>{q.service && q.startsAt ? ` before ${q.service} on ${fmtDate(q.startsAt, user?.timezone)} at ${fmtTime(q.startsAt, user?.timezone)}` : ''}</span>
              <Icon name="chevronRight" />
            </Link>
          ))}
          {msgs.unread > 0 && (
            <Link to="/messages" className="attention-link">
              <Icon name="message" />
              <span><strong>{msgs.unread} unread message{msgs.unread > 1 ? 's' : ''}</strong></span>
              <Icon name="chevronRight" />
            </Link>
          )}
          {requests.length > 0 && (
            <Link to="/sessions" className="attention-link">
              <Icon name="inbox" />
              <span><strong>{requests.length} session request{requests.length > 1 ? 's' : ''}</strong> waiting for your OK</span>
              <Icon name="chevronRight" />
            </Link>
          )}
          {(pending.data?.total ?? 0) > 0 && (
            <Link to="/admin/people?tab=pending" className="attention-link">
              <Icon name="user" />
              <span><strong>{pending.data!.total} new sign-up{pending.data!.total > 1 ? 's' : ''}</strong> waiting for approval</span>
              <Icon name="chevronRight" />
            </Link>
          )}
        </div>
      )}

      {can('sessions:view_feed') && (
        <Section title="Next up">
          {sessions.loading && !sessions.data ? (
            <Loading />
          ) : next ? (
            <div className="next-up">
              <SessionCard session={next} onChange={sessions.reload} showActivity={false} />
            </div>
          ) : (
            <Empty icon="calendar" title="No sessions coming up" action={can('bookings:create') && <Link to="/book" className="btn primary">Book a session</Link>}>
              {can('bookings:create') ? 'Find a time with a tutor in a few clicks.' : 'When students book with you, the next session shows here.'}
            </Empty>
          )}
        </Section>
      )}

      {later.length > 0 && (
        <Section title="After that" action={<Link to="/sessions" className="link-btn">All sessions</Link>}>
          <div className="session-list compact">
            {later.map((s) => <SessionCard key={s.id} session={s} onChange={sessions.reload} showActivity={false} />)}
          </div>
        </Section>
      )}

      {(sharedNotes.data?.length ?? 0) > 0 && (
        <Section title="Notes from your tutors">
          <ul className="notes">
            {sharedNotes.data!.slice(0, 3).map((n) => (
              <li key={n.id} className="note">
                <div className="note-head"><strong>{n.author}</strong><span className="muted">{fmtDate(n.createdAt, user?.timezone)}</span></div>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {newest.length > 0 && (
        <Section title="New materials" action={<Link to="/resources" className="link-btn">All resources</Link>}>
          <ul className="rows">
            {newest.map((r) => (
              <li key={r.id} className="row-item">
                <span className="row-icon"><Icon name={r.type === 'FILE' ? 'file' : r.type === 'VIDEO' ? 'video' : 'link'} /></span>
                <span className="row-text">
                  <strong>{r.title}</strong>
                  <small>Shared {fmtDate(r.createdAt, user?.timezone)}</small>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ---- first-run checklist for administrators -------------------------------------------

const DISMISSED = 'setup-checklist-dismissed';
const VISITED = 'setup-checklist-visited';
const readSet = (key: string): string[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; }
};

function SetupChecklist() {
  const { can } = useAuth();
  const services = useApi<Service[]>('/scheduling/services?all=true');
  const tutors = useApi<Paged<UserRow>>(can('users:read') ? '/users?role=tutor&status=ACTIVE&pageSize=1' : null);
  const [visited, setVisited] = useState(() => readSet(VISITED));
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; } });

  if (dismissed || !services.data) return null;
  const list = services.data.filter((x) => x.isActive);
  const steps = [
    { key: 'services', to: '/admin/services', label: 'Add the subjects people can book', hint: 'For example "ACT Math, 60 minutes".', done: list.length > 0 },
    { key: 'tutors', to: '/admin/people', label: 'Invite your tutors', hint: 'They get an email to set a password.', done: (tutors.data?.total ?? 0) > 0 },
    { key: 'assign', to: '/admin/services', label: 'Choose who teaches each subject', hint: 'Use "Tutors" on each subject.', done: list.some((x) => x.tutors.length > 0) },
    { key: 'settings', to: '/admin/settings', label: 'Check the sign-up and booking rules', hint: 'Who can join, how far ahead people can book.', done: visited.includes('settings') },
    { key: 'branding', to: '/admin/branding', label: 'Add your logo and colours', hint: 'Shown on every page and email.', done: visited.includes('branding') },
  ];
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length) return null;

  const visit = (key: string) => {
    const next = [...new Set([...visited, key])];
    setVisited(next);
    try { localStorage.setItem(VISITED, JSON.stringify(next)); } catch { /* private mode: fine */ }
  };
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* ignore */ }
  };

  return (
    <section className="panel checklist" aria-labelledby="setup-title">
      <div className="checklist-head">
        <div>
          <h2 id="setup-title" className="panel-title">Get your site ready</h2>
          <p className="muted">{doneCount} of {steps.length} done. Students can book once a subject has a tutor with weekly hours.</p>
        </div>
        <button className="link-btn" onClick={dismiss}>Hide</button>
      </div>
      <div className="checklist-bar" aria-hidden><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="checklist-steps">
        {steps.map((x) => (
          <li key={x.key} className={x.done ? 'done' : ''}>
            <span className="check-mark" aria-hidden>{x.done ? <Icon name="check" size={14} /> : null}</span>
            <Link to={x.to} onClick={() => visit(x.key)}>
              <strong>{x.label}</strong>
              <small>{x.hint}</small>
            </Link>
            <span className="sr-only">{x.done ? '(done)' : '(to do)'}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
