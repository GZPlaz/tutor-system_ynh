/**
 * My bookings (students & tutors) — and all bookings for staff with
 * bookings:read_any. Cancel (with cutoff for students) and, for tutors,
 * record the outcome after the session.
 */
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty, ErrorText, Loading, Modal, PageHeader, STATUS_TONE, Tabs, useAction, useApi, type Paged } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import { fullName, type Booking, type PublicConfig } from '../lib/types';

type View = 'upcoming' | 'past';

export function BookingsPage() {
  const { user, can } = useAuth();
  const [view, setView] = useState<View>('upcoming');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const config = useApi<PublicConfig>('/config');

  // Stable "now" per view switch keeps the query key steady between renders.
  const [now] = useState(() => new Date().toISOString());
  const range = view === 'upcoming' ? `from=${encodeURIComponent(now)}&order=asc` : `to=${encodeURIComponent(now)}&order=desc`;
  const list = useApi<Paged<Booking>>(`/scheduling/bookings?scope=${scope}&${range}&pageSize=100`);
  const items = list.data?.items ?? [];

  const [setOutcome, outcomeBusy, outcomeErr] = useAction(async (id: string, status: 'COMPLETED' | 'NO_SHOW') => {
    await api(`/scheduling/bookings/${id}/outcome`, { method: 'POST', json: { status } });
    await list.reload();
  });

  return (
    <section>
      <PageHeader
        title="Bookings"
        subtitle={config.data ? `Students can cancel up to ${config.data.studentCancelCutoffHours} h before a session.` : undefined}
        actions={
          can('bookings:read_any') && (
            <Tabs value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />
          )
        }
      />
      <Tabs value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      <ErrorText>{list.error || outcomeErr}</ErrorText>

      {list.loading && !list.data ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>No {view} bookings.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Service</th>
                <th>Student</th>
                <th>Tutor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const isTutor = b.tutor.id === user?.id;
                const started = new Date(b.startsAt) <= new Date();
                const active = b.status === 'CONFIRMED' || b.status === 'PENDING';
                return (
                  <tr key={b.id}>
                    <td>{fmtDateTime(b.startsAt, user?.timezone)}</td>
                    <td>{b.service.name}</td>
                    <td>{fullName(b.student)}</td>
                    <td>{fullName(b.tutor)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[b.status]}>{b.status.replace('_', ' ').toLowerCase()}</Badge>
                      {b.cancelReason && <div className="muted small">{b.cancelReason}</div>}
                    </td>
                    <td className="row end">
                      {active && !started && (can('bookings:cancel_own') || can('bookings:manage_any')) && (
                        <button className="secondary" onClick={() => setCancelling(b)}>
                          Cancel
                        </button>
                      )}
                      {b.status === 'CONFIRMED' && started && (isTutor || can('bookings:manage_any')) && (
                        <>
                          <button disabled={outcomeBusy} onClick={() => setOutcome(b.id, 'COMPLETED')}>
                            Completed
                          </button>
                          <button disabled={outcomeBusy} className="secondary" onClick={() => setOutcome(b.id, 'NO_SHOW')}>
                            No-show
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cancelling && (
        <CancelDialog
          booking={cancelling}
          onClose={() => setCancelling(null)}
          onDone={() => {
            setCancelling(null);
            void list.reload();
          }}
        />
      )}
    </section>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [submit, busy, error] = useAction(async () => {
    await api(`/scheduling/bookings/${booking.id}/cancel`, { method: 'POST', json: { reason: reason || undefined } });
    onDone();
  });
  return (
    <Modal title="Cancel session" onClose={onClose}>
      <p>
        <strong>{booking.service.name}</strong> on {fmtDateTime(booking.startsAt, user?.timezone)}
      </p>
      <label>
        Reason (shared with the other person)
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="row end">
        <button className="secondary" onClick={onClose}>
          Keep it
        </button>
        <button className="danger" disabled={busy} onClick={() => submit()}>
          {busy ? 'Cancelling…' : 'Cancel session'}
        </button>
      </div>
    </Modal>
  );
}
