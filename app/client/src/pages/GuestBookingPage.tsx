/**
 * The private page for ONE booking made without an account. Reached from the link in
 * the guest's emails (/booking/<id>?t=<token>); the token is the only credential.
 * Shows the session, the Google Meet link once confirmed, and lets them cancel.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PublicFrame } from '../components/PublicFrame';
import { Button, ConfirmDialog, Empty, Loading, Pill, useApi, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtTime } from '../lib/time';
import type { BookingStatus, GuestBooking } from '../lib/types';

const STATUS: Record<BookingStatus, { label: string; tone: 'good' | 'bad' | 'brand' | 'attention' | 'neutral'; blurb: string }> = {
  PENDING: { label: 'Waiting for your tutor', tone: 'attention', blurb: "Your tutor confirms each request. We'll email you as soon as they do." },
  CONFIRMED: { label: 'Confirmed', tone: 'good', blurb: 'You are all set. Join with the Google Meet link at session time.' },
  CANCELLED: { label: 'Cancelled', tone: 'bad', blurb: 'This session was cancelled.' },
  DECLINED: { label: 'Not accepted', tone: 'bad', blurb: "Your tutor couldn't take this one. You're welcome to pick another time." },
  COMPLETED: { label: 'Completed', tone: 'neutral', blurb: 'This session is finished.' },
  NO_SHOW: { label: 'Missed', tone: 'neutral', blurb: 'This session was marked as missed.' },
};

export function GuestBookingPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const booking = useApi<GuestBooking>(id && token ? `/public/bookings/${id}?${new URLSearchParams({ t: token })}` : null);
  const b = booking.data;
  const status = b ? STATUS[b.status] : null;

  return (
    <PublicFrame>
      {!id || !token ? (
        <Empty icon="link" title="This link is incomplete">Open the booking link from your confirmation email again.</Empty>
      ) : booking.loading && !b ? (
        <Loading />
      ) : booking.error || !b || !status ? (
        <Empty icon="alert" title="We couldn't find that booking">
          The link may be incomplete or out of date. Use the most recent email we sent you, or <Link to="/book">book a new session</Link>.
        </Empty>
      ) : (
        <div className="panel booking-card">
          <div className="status-line">
            <h1 className="panel-title" style={{ margin: 0 }}>Your session</h1>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <p className="muted">{status.blurb}</p>
          <dl className="summary">
            <div><dt>Subject</dt><dd>{b.service.name} ({b.service.durationMinutes} min)</dd></div>
            <div><dt>Tutor</dt><dd>{b.tutorName}</dd></div>
            <div><dt>When</dt><dd>{fmtDate(b.startsAt, b.timezone)}, {fmtTime(b.startsAt, b.timezone)} – {fmtTime(b.endsAt, b.timezone)}</dd></div>
            <div><dt>Where</dt><dd>Online, on Google Meet</dd></div>
            {b.notes && <div><dt>Your note</dt><dd>{b.notes}</dd></div>}
            {b.cancelReason && <div><dt>Reason</dt><dd>{b.cancelReason}</dd></div>}
          </dl>
          <div className="button-row">
            {b.meetingUrl && (
              <a className="btn primary" href={b.meetingUrl} target="_blank" rel="noreferrer">
                <Icon name="video" size={18} /> Join Google Meet
              </a>
            )}
            {b.canCancel && <Button variant="danger" onClick={() => setCancelling(true)}>Cancel this session</Button>}
            {(b.status === 'CANCELLED' || b.status === 'DECLINED') && <Link to="/book" className="btn primary">Book another time</Link>}
          </div>
          {b.cancelTooLate && <p className="muted small">It's less than {b.cancelCutoffHours} hours before the session, so it can no longer be cancelled here. Please reply to one of our emails if something has come up.</p>}
          {cancelling && (
            <ConfirmDialog
              title="Cancel this session?"
              confirmLabel="Cancel session"
              danger
              reasonLabel="Reason (optional)"
              onClose={() => setCancelling(false)}
              onConfirm={async (reason) => {
                await api(`/public/bookings/${id}/cancel?${new URLSearchParams({ t: token })}`, { method: 'POST', json: { reason } });
                toast('Session cancelled');
                booking.reload();
              }}
            >
              <p>{b.service.name} with {b.tutorName}, {fmtDate(b.startsAt, b.timezone)} at {fmtTime(b.startsAt, b.timezone)}.</p>
            </ConfirmDialog>
          )}
        </div>
      )}
    </PublicFrame>
  );
}
