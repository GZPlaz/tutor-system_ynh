/**
 * Calendar — bookings in a month grid (or a list). Students and tutors see their own
 * sessions; admins can switch to everyone's and filter by tutor. Times use the viewer's
 * time zone; click a session for details.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Button, ErrorText, Loading, Modal, PageHeader, Pill, Segmented, useApi, type Paged, type Tone } from '../components/ui';
import type { UserRow } from '../lib/types';

interface CalEvent {
  id: string; startsAt: string; endsAt: string; status: string; service: string;
  myRole: 'student' | 'tutor' | 'staff'; student: string; tutor: string; tutorId: string; meetingUrl: string | null;
}
const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Requested', tone: 'attention' }, CONFIRMED: { label: 'Confirmed', tone: 'brand' },
  COMPLETED: { label: 'Completed', tone: 'good' }, NO_SHOW: { label: 'Missed', tone: 'neutral' }, CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

/** Y-M-D of an instant in a time zone (for grouping into days). */
const dayKey = (d: Date, tz?: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const timeOf = (iso: string, tz?: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));

export function CalendarPage() {
  const { user, can } = useAuth();
  const tz = user?.timezone;
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<'month' | 'list'>(() => (window.innerWidth < 700 ? 'list' : 'month'));
  const staff = can('bookings:read_any') || can('bookings:manage_any');
  const [scope, setScope] = useState<'mine' | 'all'>(staff ? 'all' : 'mine');
  const [tutorId, setTutorId] = useState('');
  const [open, setOpen] = useState<CalEvent | null>(null);

  // 6 weeks starting on the Monday on/before the 1st.
  const gridStart = useMemo(() => { const d = new Date(month); d.setDate(1 - ((d.getDay() + 6) % 7)); return d; }, [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; }), [gridStart]);
  const from = new Date(days[0]!); from.setDate(from.getDate() - 1);
  const to = new Date(days[41]!); to.setDate(to.getDate() + 2);
  const qs = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), scope });
  if (scope === 'all' && tutorId) qs.set('tutorId', tutorId);
  const events = useApi<CalEvent[]>(`/sessions/calendar/range?${qs}`);
  const tutors = useApi<Paged<UserRow>>(staff && scope === 'all' ? '/users?role=tutor&status=ACTIVE&pageSize=100' : null);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events.data ?? []) { const k = dayKey(new Date(e.startsAt), tz); m.set(k, [...(m.get(k) ?? []), e]); }
    return m;
  }, [events.data, tz]);
  const todayKey = dayKey(today, tz);
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const move = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const inMonth = (d: Date) => d.getMonth() === month.getMonth();
  const listDays = days.filter((d) => inMonth(d) && byDay.has(dayKey(d, tz)));

  const label = (e: CalEvent) => (e.myRole === 'student' ? `${e.service} with ${e.tutor}` : e.myRole === 'tutor' ? `${e.service} with ${e.student}` : `${e.service}: ${e.student} / ${e.tutor}`);

  return (
    <div className="page wide">
      <PageHeader title="Calendar" description={scope === 'all' ? "Everyone's sessions. Times are in your time zone." : `Your sessions, shown in your time zone (${tz}).`}
        action={can('bookings:create') && <Link className="btn primary" to="/book"><Icon name="calendarPlus" size={18} /> Book a session</Link>} />
      <div className="cal-toolbar">
        <div className="button-row tight">
          <Button variant="secondary" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
          <button className="icon-btn" aria-label="Previous month" onClick={() => move(-1)}><Icon name="chevronLeft" /></button>
          <button className="icon-btn" aria-label="Next month" onClick={() => move(1)}><Icon name="chevronRight" /></button>
          <h2 className="cal-month" aria-live="polite">{monthLabel}</h2>
        </div>
        <span className="spacer" />
        {staff && <Segmented label="Whose sessions" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />}
        {staff && scope === 'all' && (
          <select className="cal-filter" value={tutorId} onChange={(e) => setTutorId(e.target.value)} aria-label="Filter by tutor">
            <option value="">All tutors</option>
            {tutors.data?.items.map((t) => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
          </select>
        )}
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'list', label: 'List' }]} />
      </div>
      <ErrorText>{events.error}</ErrorText>
      {events.loading && !events.data ? <Loading /> : view === 'month' ? (
        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
          {days.map((d) => {
            const k = dayKey(d, tz);
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} role="gridcell" className={`cal-day ${inMonth(d) ? '' : 'other'} ${k === todayKey ? 'today' : ''}`}>
                <span className="cal-date">{d.getDate()}</span>
                {list.slice(0, 3).map((e) => (
                  <button key={e.id} className={`cal-event s-${e.status.toLowerCase()}`} onClick={() => setOpen(e)} title={`${timeOf(e.startsAt, tz)} ${label(e)}`}>
                    <span className="cal-time">{timeOf(e.startsAt, tz)}</span> {e.myRole === 'staff' ? `${e.service} · ${e.student.split(' ')[0]}` : e.myRole === 'student' ? e.tutor : e.student}
                  </button>
                ))}
                {list.length > 3 && <button className="cal-more" onClick={() => { setView('list'); }}>+{list.length - 3} more</button>}
              </div>
            );
          })}
        </div>
      ) : !listDays.length ? (
        <p className="muted empty-line">No sessions in {monthLabel}.</p>
      ) : (
        <div className="cal-list">
          {listDays.map((d) => (
            <section key={dayKey(d, tz)}>
              <h3 className={dayKey(d, tz) === todayKey ? 'today' : ''}>{d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <ul className="rows">
                {byDay.get(dayKey(d, tz))!.map((e) => (
                  <li key={e.id} className="row-item clickable" onClick={() => setOpen(e)}>
                    <span className="cal-list-time">{timeOf(e.startsAt, tz)}–{timeOf(e.endsAt, tz)}</span>
                    <span className="row-text"><strong>{label(e)}</strong></span>
                    <Pill tone={STATUS[e.status]?.tone ?? 'neutral'}>{STATUS[e.status]?.label ?? e.status}</Pill>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="cal-legend" aria-hidden>
        <span className="s-confirmed">Confirmed</span><span className="s-pending">Requested</span><span className="s-completed">Completed</span><span className="s-cancelled">Cancelled</span>
      </div>

      {open && (
        <Modal title={open.service} onClose={() => setOpen(null)}
          footer={<>
            {open.meetingUrl && open.myRole !== 'staff' && <a className="btn primary" href={open.meetingUrl} target="_blank" rel="noopener noreferrer"><Icon name="video" size={18} /> Join Google Meet</a>}
            <Link className="btn secondary" to={open.myRole === 'staff' ? `/admin/people/${open.tutorId}` : open.status === 'COMPLETED' || open.status === 'CANCELLED' || open.status === 'NO_SHOW' ? '/sessions?view=past' : '/sessions'}>
              {open.myRole === 'staff' ? "Open tutor's account" : 'Open in Sessions'}
            </Link>
          </>}>
          <dl className="summary">
            <div><dt>When</dt><dd>{new Date(open.startsAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })}, {timeOf(open.startsAt, tz)} – {timeOf(open.endsAt, tz)}</dd></div>
            <div><dt>Student</dt><dd>{open.student}</dd></div>
            <div><dt>Tutor</dt><dd>{open.tutor}</dd></div>
            <div><dt>Status</dt><dd><Pill tone={STATUS[open.status]?.tone ?? 'neutral'}>{STATUS[open.status]?.label ?? open.status}</Pill></dd></div>
          </dl>
        </Modal>
      )}
    </div>
  );
}
