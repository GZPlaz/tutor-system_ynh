/** Home: next sessions, plus role-aware shortcuts (pending approvals for admins). */
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Can } from '../auth/guards';
import { Badge, Empty, Loading, PageHeader, useApi, type Paged } from '../components/ui';
import { fmtDateTime } from '../lib/time';
import type { Booking } from '../lib/types';
import { fullName } from '../lib/types';

export function DashboardPage() {
  const { user, can } = useAuth();
  const nowIso = new Date().toISOString();
  const upcoming = useApi<Paged<Booking>>(
    can('bookings:read_own') ? `/scheduling/bookings?scope=mine&status=CONFIRMED&from=${encodeURIComponent(nowIso)}&pageSize=5` : null,
  );
  const pending = useApi<Paged<unknown>>(can('users:approve') ? '/users?status=PENDING&pageSize=1' : null);

  return (
    <section>
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} subtitle={`All times shown in ${user?.timezone}`} />

      <div className="grid">
        <Can permission="users:approve">
          <Link to="/admin/approvals" className="card stat">
            <span className="stat-value">{pending.data?.total ?? '…'}</span>
            <span className="muted">registrations awaiting approval</span>
          </Link>
        </Can>
        <Can permission="bookings:create">
          <Link to="/book" className="card stat">
            <span className="stat-value">＋</span>
            <span className="muted">Book a session</span>
          </Link>
        </Can>
        <Can permission="availability:manage_own">
          <Link to="/availability" className="card stat">
            <span className="stat-value">🗓</span>
            <span className="muted">Set your availability</span>
          </Link>
        </Can>
        <Can permission="resources:read_assigned">
          <Link to="/resources" className="card stat">
            <span className="stat-value">📚</span>
            <span className="muted">Learning resources</span>
          </Link>
        </Can>
      </div>

      <Can permission="bookings:read_own">
        <h2>Upcoming sessions</h2>
        {upcoming.loading && !upcoming.data ? (
          <Loading />
        ) : upcoming.data?.items.length ? (
          <ul className="list">
            {upcoming.data.items.map((b) => {
              const isTutor = b.tutor.id === user?.id;
              return (
                <li key={b.id} className="card row between">
                  <div>
                    <strong>{b.service.name}</strong> with {fullName(isTutor ? b.student : b.tutor)}
                    <div className="muted">{fmtDateTime(b.startsAt, user?.timezone)}</div>
                  </div>
                  {b.meetingUrl ? <Badge tone="good">Join link ready</Badge> : <Badge>Link pending</Badge>}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No upcoming sessions.</Empty>
        )}
        <p>
          <Link to="/sessions">Open the Session Feed →</Link>
        </p>
      </Can>
    </section>
  );
}
