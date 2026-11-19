/**
 * Book a session in three steps: subject → day & time → confirm.
 * Times are shown in the student's own time zone. The request goes to the
 * tutor, who confirms it; the student is told that up front.
 *
 * Without an account (Admin → Settings → "Account needed to book" off) the same screens
 * work for visitors: they use the /public endpoints, give a name and email in step 3,
 * and get a private link by email.

 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Button, Empty, ErrorText, Loading, PageHeader, useAction, useApi } from '../components/ui';
import { api } from '../lib/api';
import { browserTimeZone, fmtTime } from '../lib/time';
import type { PublicConfig, Service } from '../lib/types';

interface Slot { startsAt: string; endsAt: string }
interface TutorSlots { tutor: { id: string; name: string }; slots: Slot[] }
interface Pick { tutorId: string; tutorName: string; slot: Slot }

const DAYS = 14;
const STEPS = ['Subject', 'Time', 'Confirm'] as const;

export function BookPage() {
  const { user } = useAuth();
  const guest = !user;
  const tz = user?.timezone ?? browserTimeZone();
  const services = useApi<Service[]>(guest ? '/public/services' : '/scheduling/services');
  const config = useApi<PublicConfig>('/config');
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service | null>(null);
  const [tutorId, setTutorId] = useState<string>('any');
  const [period, setPeriod] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [notes, setNotes] = useState('');
  const [sent, setSent] = useState(false);
  const [who, setWho] = useState({ firstName: '', lastName: '', email: '', website: '' });

  const range = useMemo(() => {
    const from = new Date(Date.now() + period * DAYS * 86_400_000);
    return { from: from.toISOString(), to: new Date(from.getTime() + DAYS * 86_400_000).toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, service?.id]);
  const slots = useApi<TutorSlots[]>(service ? `${guest ? '/public' : '/scheduling'}/slots?${new URLSearchParams({ serviceId: service.id, ...range })}` : null);

  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

  // Flatten to one list of {time, tutor} for the chosen tutor filter, grouped by local day.
  const byDay = useMemo(() => {
    const map = new Map<string, Pick[]>();
    for (const t of slots.data ?? []) {
      if (tutorId !== 'any' && t.tutor.id !== tutorId) continue;
      for (const slot of t.slots) {
        const k = dayKey(slot.startsAt);
        map.set(k, [...(map.get(k) ?? []), { tutorId: t.tutor.id, tutorName: t.tutor.name, slot }]);
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.data, tutorId, tz]);

  const dayStrip = useMemo(() => {
    const out: { key: string; date: Date }[] = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(new Date(range.from).getTime() + i * 86_400_000);
      out.push({ key: dayKey(d.toISOString()), date: d });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, tz]);

  const activeDay = day && byDay.has(day) ? day : dayStrip.find((d) => byDay.has(d.key))?.key ?? null;
  const multipleTutors = (slots.data?.length ?? 0) > 1;
  const horizon = config.data?.bookingMaxHorizonDays ?? 60;

  const [send, sending, sendError] = useAction(async () => {
    if (!service || !pick) return;
    try {
      if (guest) {
        await api('/public/bookings', {
          method: 'POST',
          json: {
            serviceId: service.id,
            tutorId: pick.tutorId,
            startsAt: pick.slot.startsAt,
            notes: notes.trim() || undefined,
            timezone: tz,
            firstName: who.firstName.trim(),
            lastName: who.lastName.trim(),
            email: who.email.trim(),
            website: who.website,
          },
        });
        setSent(true);
        return;
      }
      await api('/scheduling/bookings', {
        method: 'POST',
        json: { serviceId: service.id, tutorId: pick.tutorId, startsAt: pick.slot.startsAt, notes: notes.trim() || undefined },
      });
      setSent(true);
    } catch (e) {
      void slots.reload();
      throw e;
    }
  });

  const fmtDay = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...o, timeZone: tz }).format(d);

  const guestIncomplete = guest && (!who.firstName.trim() || !who.lastName.trim() || !/^\S+@\S+\.\S+$/.test(who.email.trim()));

  if (sent && pick && service) {
    return (
      <div className={guest ? '' : 'page narrow'}>
        <div className="done panel">
          <div className="done-icon"><Icon name="check" size={28} /></div>
          <h1>Request sent</h1>
          <p>
            {service.name} with {pick.tutorName}, {fmtDay(new Date(pick.slot.startsAt), { weekday: 'long', month: 'long', day: 'numeric' })} at {fmtTime(pick.slot.startsAt, tz)}.
          </p>
          <p className="muted">The time is held for you. We'll email you as soon as {pick.tutorName.split(' ')[0]} confirms.</p>
          {guest && <p>We sent a confirmation to <strong>{who.email.trim()}</strong>. It has a private link where you can see this booking, find the Google Meet link and cancel if you need to. If you don't see it, check your spam folder.</p>}
          <div className="button-row">
            {!guest && <Link to="/sessions" className="btn primary">See my sessions</Link>}
            <Button variant={guest ? 'primary' : 'secondary'} onClick={() => { setSent(false); setPick(null); setNotes(''); setStep(0); setService(null); }}>Book another</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={guest ? '' : 'page narrow'}>
      <PageHeader title="Book a session" description={`Times are shown in ${tz}.`} />
      {guest && (
        <p className="guest-note">
          <Icon name="user" size={18} />
          <span>No account needed — we just need your name and email at the end. <Link to="/login">Already have an account? Sign in</Link></span>
        </p>
      )}

      <ol className="stepper" aria-label="Booking steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="step-num">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="panel">
          <h2 className="panel-title">What would you like help with?</h2>
          <ErrorText>{services.error}</ErrorText>
          {services.loading && !services.data ? (
            <Loading />
          ) : !services.data?.length ? (
            <Empty icon="layers" title="Nothing to book yet">Subjects will appear here once they're set up.</Empty>
          ) : (
            <div className="choice-list" role="radiogroup">
              {services.data.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={service?.id === s.id}
                  className={`choice ${service?.id === s.id ? 'selected' : ''}`}
                  onClick={() => { setService(s); setTutorId('any'); setPeriod(0); setDay(null); setPick(null); setStep(1); }}
                >
                  <span className="choice-text">
                    <strong>{s.name}</strong>
                    {s.description && <span>{s.description}</span>}
                  </span>
                  <span className="choice-meta">{s.durationMinutes} min</span>
                  <Icon name="chevronRight" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 1 && service && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Pick a time for {service.name}</h2>
            <button className="link-btn" onClick={() => setStep(0)}>Change subject</button>
          </div>

          {multipleTutors && (
            <label className="field inline-field">
              <span>Tutor</span>
              <select value={tutorId} onChange={(e) => { setTutorId(e.target.value); setDay(null); }}>
                <option value="any">Any available tutor</option>
                {slots.data!.map((t) => <option key={t.tutor.id} value={t.tutor.id}>{t.tutor.name}</option>)}
              </select>
            </label>
          )}

          <div className="day-strip-head">
            <button className="icon-btn" disabled={period === 0} onClick={() => { setPeriod(period - 1); setDay(null); }} aria-label="Earlier dates"><Icon name="chevronLeft" /></button>
            <span>{fmtDay(new Date(range.from), { month: 'long', day: 'numeric' })} – {fmtDay(new Date(new Date(range.to).getTime() - 1), { month: 'long', day: 'numeric' })}</span>
            <button className="icon-btn" disabled={(period + 1) * DAYS >= horizon} onClick={() => { setPeriod(period + 1); setDay(null); }} aria-label="Later dates"><Icon name="chevronRight" /></button>
          </div>

          {slots.loading && !slots.data ? (
            <Loading label="Finding open times" />
          ) : (
            <>
              <div className="day-strip" role="listbox" aria-label="Day">
                {dayStrip.map(({ key, date }) => {
                  const open = byDay.has(key);
                  return (
                    <button key={key} role="option" aria-selected={activeDay === key} disabled={!open} className={`day ${activeDay === key ? 'selected' : ''}`} onClick={() => setDay(key)}>
                      <span className="day-weekday">{fmtDay(date, { weekday: 'short' })}</span>
                      <span className="day-num">{fmtDay(date, { day: 'numeric' })}</span>
                    </button>
                  );
                })}
              </div>
              {activeDay ? (
                <div className="times" role="radiogroup" aria-label="Time">
                  {byDay.get(activeDay)!.map((p) => (
                    <button
                      key={p.tutorId + p.slot.startsAt}
                      role="radio"
                      aria-checked={pick?.slot.startsAt === p.slot.startsAt && pick.tutorId === p.tutorId}
                      className="time"
                      onClick={() => { setPick(p); setStep(2); }}
                    >
                      <strong>{fmtTime(p.slot.startsAt, tz)}</strong>
                      {tutorId === 'any' && multipleTutors && <span>{p.tutorName}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon="clock" title="No open times in these two weeks">Try later dates with the arrow above{multipleTutors ? ', or choose another tutor' : ''}.</Empty>
              )}
            </>
          )}
          <ErrorText>{slots.error}</ErrorText>
        </div>
      )}

      {step === 2 && service && pick && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Check and send</h2>
            <button className="link-btn" onClick={() => setStep(1)}>Change time</button>
          </div>
          <dl className="summary">
            <div><dt>Subject</dt><dd>{service.name}</dd></div>
            <div><dt>Tutor</dt><dd>{pick.tutorName}</dd></div>
            <div><dt>When</dt><dd>{fmtDay(new Date(pick.slot.startsAt), { weekday: 'long', month: 'long', day: 'numeric' })}, {fmtTime(pick.slot.startsAt, tz)} – {fmtTime(pick.slot.endsAt, tz)}</dd></div>
            <div><dt>Where</dt><dd>Online, on Google Meet</dd></div>
            <div><dt>Cost</dt><dd>Free</dd></div>
          </dl>
          {guest && (
            <>
              <div className="form-row">
                <label className="field">
                  <span>First name</span>
                  <input value={who.firstName} maxLength={80} autoComplete="given-name" onChange={(e) => setWho({ ...who, firstName: e.target.value })} required />
                </label>
                <label className="field">
                  <span>Last name</span>
                  <input value={who.lastName} maxLength={80} autoComplete="family-name" onChange={(e) => setWho({ ...who, lastName: e.target.value })} required />
                </label>
              </div>
              <label className="field">
                <span>Email</span>
                <input type="email" value={who.email} autoComplete="email" onChange={(e) => setWho({ ...who, email: e.target.value })} required />
                <small className="hint">We'll send your confirmation and Google Meet link here.</small>
              </label>
              <label className="hp-field" aria-hidden="true">
                Website <input tabIndex={-1} autoComplete="off" value={who.website} onChange={(e) => setWho({ ...who, website: e.target.value })} />
              </label>
            </>
          )}
          <label className="field">
            <span>Anything your tutor should know? (optional)</span>
            <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Topics you want to cover, homework you're stuck on…" />
          </label>
          <p className="muted">
            Your tutor confirms each request. We'll email you as soon as they do.
            {config.data ? ` You can cancel up to ${config.data.studentCancelCutoffHours} hours before.` : ''}
          </p>
          <ErrorText>{sendError}</ErrorText>
          <div className="button-row">
            <Button busy={sending} disabled={guest && guestIncomplete} onClick={() => send()}>
              Send request
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
          </div>
        </div>
      )}
    </div>
  );
}
