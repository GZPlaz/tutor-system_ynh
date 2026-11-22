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
import type { Resource, Session } from '../lib/types';

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

      {(requests.length > 0 || (pending.data?.total ?? 0) > 0 || msgs.unread > 0 || msgs.openQuestions.length > 0) && (
        <div className="attention-list">
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
