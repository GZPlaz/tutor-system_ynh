/**
 * Sessions — one place for everything booked. Upcoming shows requests that
 * need the tutor's OK first, then sessions in date order. Refreshes every
 * 30 seconds so a new Meet link or "Live now" appears without reloading.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Section } from '../components/Shell';
import { SessionCard } from '../components/SessionCard';
import { Empty, ErrorText, Loading, PageHeader, Segmented, useApi } from '../components/ui';
import type { Session } from '../lib/types';

export function SessionsPage() {
  const { can, canAny } = useAuth();
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const list = useApi<Session[]>(`/sessions?view=${view}&scope=${scope}`);

  const items = list.data ?? [];

  useEffect(() => {
    const t = setInterval(() => void list.reload(), 30_000);
    return () => clearInterval(t);
  }, [list.reload]);

  const requests = useMemo(() => (view === 'upcoming' ? items.filter((s) => s.status === 'PENDING' && s.actions.confirm) : []), [items, view]);
  const rest = useMemo(() => items.filter((s) => !requests.includes(s)), [items, requests]);

  return (
    <div className="page">
      <PageHeader
        title="Sessions"
        description={view === 'upcoming' ? 'Everything coming up. Join links appear here.' : 'Sessions that have finished, or were cancelled or declined.'}
        action={can('bookings:create') && <Link to="/book" className="btn primary">Book a session</Link>}
      />
      <div className="toolbar">
        <Segmented label="Which sessions" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        {canAny('bookings:read_any', 'bookings:manage_any') && (
          <Segmented label="Whose sessions" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />
        )}
      </div>
      <ErrorText>{list.error}</ErrorText>

      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        view === 'upcoming' ? (
          <Empty icon="calendar" title="Nothing booked yet" action={can('bookings:create') && <Link to="/book" className="btn primary">Book a session</Link>}>
            {can('bookings:create') ? 'Pick a subject and a time that suits you.' : 'Sessions that students book with you will show up here.'}
          </Empty>
        ) : (
          <Empty icon="calendar" title="No past sessions yet" />
        )
      ) : (
        <>
          {requests.length > 0 && (
            <Section title={`Waiting for your OK (${requests.length})`}>
              <p className="section-lead">Confirm or decline each request. If you don't respond before the start time, it's declined automatically.</p>
              <div className="session-list">
                {requests.map((s) => <SessionCard key={s.id} session={s} onChange={list.reload} />)}
              </div>
            </Section>
          )}
          {rest.length > 0 && (
            <Section title={view === 'upcoming' ? 'Coming up' : 'Earlier'}>
              <div className="session-list">
                {rest.map((s) => <SessionCard key={s.id} session={s} onChange={list.reload} />)}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
