/**
 * Booking flow: pick a service → see each tutor's open slots for the next
 * 14 days (in the student's timezone) → add a note → confirm.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Empty, ErrorText, Loading, Modal, PageHeader, useAction, useApi } from '../components/ui';
import { api } from '../lib/api';
import { fmtDateTime, fmtTime, groupByDay } from '../lib/time';
import type { PublicConfig, Service } from '../lib/types';

interface Slot { startsAt: string; endsAt: string }
interface TutorSlots { tutor: { id: string; name: string }; slots: Slot[] }
const DAYS = 14;

export function BookPage() {
  const { user } = useAuth();
  const tz = user?.timezone;
  const navigate = useNavigate();
  const services = useApi<Service[]>('/scheduling/services');
  const config = useApi<PublicConfig>('/config');
  const [serviceId, setServiceId] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [picked, setPicked] = useState<{ tutorId: string; tutorName: string; slot: Slot } | null>(null);
  const [notes, setNotes] = useState('');

  // Recomputed only when the period or service changes, so the request URL stays stable.
  const range = useMemo(() => {
    const from = new Date(Date.now() + weekOffset * DAYS * 86_400_000);
    return { from: from.toISOString(), to: new Date(from.getTime() + DAYS * 86_400_000).toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, serviceId]);

  const slots = useApi<TutorSlots[]>(
    serviceId ? `/scheduling/slots?${new URLSearchParams({ serviceId, from: range.from, to: range.to })}` : null,
  );
  const service = services.data?.find((s) => s.id === serviceId);

  const [confirm, booking, bookError] = useAction(async () => {
    if (!picked) return;
    try {
      await api('/scheduling/bookings', {
        method: 'POST',
        json: { serviceId, tutorId: picked.tutorId, startsAt: picked.slot.startsAt, notes: notes || undefined },
      });
      navigate('/sessions');
    } catch (e) {
      void slots.reload(); // the slot may have just been taken
      throw e;
    }
  });

  const horizon = config.data?.bookingMaxHorizonDays ?? 60;
  const canGoForward = (weekOffset + 1) * DAYS < horizon;

  return (
    <section>
      <PageHeader
        title="Book a session"
        subtitle={
          <>
            Times are shown in {tz}.
            {config.data && ` Book at least ${config.data.bookingMinLeadHours} h ahead; cancel up to ${config.data.studentCancelCutoffHours} h before.`}
          </>
        }
      />
      <ErrorText>{services.error}</ErrorText>
      {services.loading && !services.data ? (
        <Loading />
      ) : !services.data?.length ? (
        <Empty>No services are open for booking yet.</Empty>
      ) : (
        <div className="service-picker">
          {services.data.map((s) => (
            <button key={s.id} className={`service ${s.id === serviceId ? 'selected' : ''}`} onClick={() => { setServiceId(s.id); setWeekOffset(0); }}>
              <strong>{s.name}</strong>
              <span className="muted small">{s.durationMinutes} min</span>
              {s.description && <span className="muted small">{s.description}</span>}
            </button>
          ))}
        </div>
      )}

      {service && (
        <>
          <div className="row between">
            <h2>Open times</h2>
            <div className="row">
              <button className="secondary" disabled={weekOffset === 0} onClick={() => setWeekOffset((w) => w - 1)}>← Earlier</button>
              <button className="secondary" disabled={!canGoForward} onClick={() => setWeekOffset((w) => w + 1)}>Later →</button>
            </div>
          </div>
          <ErrorText>{slots.error}</ErrorText>
          {slots.loading && !slots.data && <Loading what="Finding open times" />}
          {slots.data?.length === 0 && <Empty>No tutors offer this service yet.</Empty>}
          {slots.data?.map(({ tutor, slots: list }) => (
            <div key={tutor.id} className="card">
              <h3>{tutor.name}</h3>
              {list.length === 0 && <p className="muted">No open times in this period.</p>}
              {groupByDay(list, tz).map(([day, daySlots]) => (
                <div key={day} className="day">
                  <h4>{day}</h4>
                  <div className="slots">
                    {daySlots.map((slot) => (
                      <button key={slot.startsAt} className="slot" onClick={() => { setPicked({ tutorId: tutor.id, tutorName: tutor.name, slot }); setNotes(''); }}>
                        {fmtTime(slot.startsAt, tz)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {picked && service && (
        <Modal title="Confirm booking" onClose={() => setPicked(null)}>
          <p>
            <strong>{service.name}</strong> with <strong>{picked.tutorName}</strong>
            <br />
            {fmtDateTime(picked.slot.startsAt, tz)} – {fmtTime(picked.slot.endsAt, tz)}
          </p>
          <label>
            Anything your tutor should know? (optional)
            <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topics, homework you're stuck on…" />
          </label>
          <p className="muted small">Sessions are online. Your Google Meet link will appear in the Session Feed shortly before the start.</p>
          <ErrorText>{bookError}</ErrorText>
          <div className="row end">
            <button className="secondary" onClick={() => setPicked(null)}>Back</button>
            <button disabled={booking} onClick={() => confirm()}>{booking ? 'Booking…' : 'Confirm booking'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
