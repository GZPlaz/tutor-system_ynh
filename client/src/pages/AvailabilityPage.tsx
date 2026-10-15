/**
 * Tutor availability: a weekly template (wall-clock times in the tutor's
 * timezone) plus one-off exceptions (blackouts or extra hours).
 * Staff with availability:manage_any can pick any tutor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty, ErrorText, Loading, PageHeader, useAction, useApi, type Paged } from '../components/ui';
import { api } from '../lib/api';
import { WEEKDAYS, allTimeZones, fmtDateTime, hhmmToMinutes, minutesToHHMM, zonedToUtc } from '../lib/time';
import { fullName, type AvailabilityException, type AvailabilityRule, type UserRow } from '../lib/types';

interface Row {
  key: number;
  weekday: number;
  start: string;
  end: string;
}
let rowKey = 0;

export function AvailabilityPage() {
  const { user, can } = useAuth();
  const canAny = can('availability:manage_any');
  const tutors = useApi<Paged<UserRow>>(canAny ? '/users?role=tutor&status=ACTIVE&pageSize=100' : null);
  const [tutorId, setTutorId] = useState(user?.id ?? '');
  const data = useApi<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }>(tutorId ? `/scheduling/availability/${tutorId}` : null);

  const [rows, setRows] = useState<Row[]>([]);
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [saved, setSaved] = useState(false);

  // Load server rules into editable rows.
  useEffect(() => {
    if (!data.data) return;
    setRows(
      data.data.rules.map((r) => ({ key: ++rowKey, weekday: r.weekday, start: minutesToHHMM(r.startMinute), end: minutesToHHMM(r.endMinute) })),
    );
    setTimezone(data.data.rules[0]?.timezone ?? user?.timezone ?? 'UTC');
  }, [data.data, user?.timezone]);

  const toMinutes = (r: Row) => ({ start: hhmmToMinutes(r.start), end: r.end === '00:00' ? 1440 : hhmmToMinutes(r.end) });
  const problems = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= 7; d++) {
      const day = rows.filter((r) => r.weekday === d).map(toMinutes).sort((a, b) => a.start - b.start);
      day.forEach((r, i) => {
        if (r.start >= r.end) out.push(`${WEEKDAYS[d - 1]}: a block ends before it starts`);
        const next = day[i + 1];
        if (next && next.start < r.end) out.push(`${WEEKDAYS[d - 1]}: blocks overlap`);
      });
    }
    return [...new Set(out)];
  }, [rows]);

  const [save, saving, saveError] = useAction(async () => {
    const rules = rows.map((r) => ({ weekday: r.weekday, startMinute: toMinutes(r).start, endMinute: toMinutes(r).end, timezone }));
    await api(`/scheduling/availability/${tutorId}/rules`, { method: 'PUT', json: { rules } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await data.reload();
  });

  const addRow = (weekday: number) => setRows((rs) => [...rs, { key: ++rowKey, weekday, start: '09:00', end: '12:00' }]);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const copyMondayToWeekdays = () =>
    setRows((rs) => {
      const monday = rs.filter((r) => r.weekday === 1);
      return [...rs.filter((r) => r.weekday === 1 || r.weekday > 5), ...[2, 3, 4, 5].flatMap((wd) => monday.map((m) => ({ ...m, key: ++rowKey, weekday: wd })))];
    });

  return (
    <section>
      <PageHeader title="Availability" subtitle="Students can book any time inside these blocks (minus existing sessions)." />

      {canAny && (
        <label className="inline">
          Tutor
          <select value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            {user && <option value={user.id}>Me</option>}
            {tutors.data?.items.filter((t) => t.id !== user?.id).map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </label>
      )}

      <ErrorText>{data.error}</ErrorText>
      {data.loading && !data.data ? (
        <Loading />
      ) : (
        <>
          <div className="card">
            <div className="row between">
              <h2>Weekly hours</h2>
              <label className="inline">
                Timezone
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}
                </select>
              </label>
            </div>
            <div className="week">
              {WEEKDAYS.map((name, i) => {
                const wd = i + 1;
                const dayRows = rows.filter((r) => r.weekday === wd);
                return (
                  <div key={name} className="week-day">
                    <strong>{name}</strong>
                    <div className="stack tight">
                      {dayRows.length === 0 && <span className="muted">Unavailable</span>}
                      {dayRows.map((r) => (
                        <div key={r.key} className="row">
                          <input type="time" step={900} value={r.start} onChange={(e) => update(r.key, { start: e.target.value })} aria-label={`${name} start`} />
                          <span>–</span>
                          <input type="time" step={900} value={r.end} onChange={(e) => update(r.key, { end: e.target.value })} aria-label={`${name} end`} />
                          <button className="link" onClick={() => remove(r.key)} aria-label="Remove block">✕</button>
                        </div>
                      ))}
                    </div>
                    <button className="link" onClick={() => addRow(wd)}>+ Add hours</button>
                  </div>
                );
              })}
            </div>
            <p className="muted small">Use 00:00 as the end time to mean midnight.</p>
            {problems.map((p) => <p key={p} className="error">{p}</p>)}
            <ErrorText>{saveError}</ErrorText>
            <div className="row end">
              <button className="secondary" onClick={copyMondayToWeekdays}>Copy Monday to Tue–Fri</button>
              <button disabled={saving || problems.length > 0} onClick={() => save()}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save weekly hours'}</button>
            </div>
          </div>

          <Exceptions tutorId={tutorId} timezone={timezone} items={data.data?.exceptions ?? []} onChange={data.reload} />
        </>
      )}
    </section>
  );
}

function Exceptions({ tutorId, timezone, items, onChange }: { tutorId: string; timezone: string; items: AvailabilityException[]; onChange: () => void }) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, endDate: today, start: '09:00', end: '17:00', allDay: true, isAvailable: false, reason: '' });

  const [add, adding, addError] = useAction(async () => {
    const startsAt = zonedToUtc(form.date, form.allDay ? '00:00' : form.start, timezone);
    const endDay = form.allDay ? new Date(Date.UTC(...(form.endDate.split('-').map(Number) as [number, number, number]))) : null;
    const endsAt = form.allDay
      ? zonedToUtc(new Date(endDay!.getTime() + 86_400_000).toISOString().slice(0, 10), '00:00', timezone)
      : zonedToUtc(form.date, form.end, timezone);
    await api(`/scheduling/availability/${tutorId}/exceptions`, {
      method: 'POST',
      json: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), isAvailable: form.isAvailable, reason: form.reason || undefined },
    });
    setForm((f) => ({ ...f, reason: '' }));
    onChange();
  });

  const [del, , delError] = useAction(async (id: string) => {
    await api(`/scheduling/availability/exceptions/${id}`, { method: 'DELETE' });
    onChange();
  });

  return (
    <div className="card">
      <h2>Time off & extra hours</h2>
      {items.length === 0 ? (
        <Empty>No upcoming exceptions.</Empty>
      ) : (
        <ul className="list">
          {items.map((x) => (
            <li key={x.id} className="row between">
              <span>
                <Badge tone={x.isAvailable ? 'good' : 'bad'}>{x.isAvailable ? 'Extra hours' : 'Time off'}</Badge>{' '}
                {fmtDateTime(x.startsAt, user?.timezone)} → {fmtDateTime(x.endsAt, user?.timezone)}
                {x.reason && <span className="muted"> · {x.reason}</span>}
              </span>
              <button className="link" onClick={() => del(x.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{delError}</ErrorText>

      <div className="form-grid">
        <label>
          Type
          <select value={form.isAvailable ? 'extra' : 'off'} onChange={(e) => setForm({ ...form, isAvailable: e.target.value === 'extra', allDay: e.target.value === 'off' ? form.allDay : false })}>
            <option value="off">Time off (blocks booking)</option>
            <option value="extra">Extra hours (opens booking)</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> Whole days
        </label>
        <label>
          {form.allDay ? 'From' : 'Date'}
          <input type="date" value={form.date} min={today} onChange={(e) => setForm({ ...form, date: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} />
        </label>
        {form.allDay ? (
          <label>
            Until (inclusive)
            <input type="date" value={form.endDate} min={form.date} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
        ) : (
          <div className="row">
            <label>
              Start
              <input type="time" step={900} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </label>
            <label>
              End
              <input type="time" step={900} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </label>
          </div>
        )}
        <label>
          Note (optional)
          <input value={form.reason} maxLength={300} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
      </div>
      <p className="muted small">Times are in {timezone}.</p>
      <ErrorText>{addError}</ErrorText>
      <div className="row end">
        <button disabled={adding} onClick={() => add()}>{adding ? 'Adding…' : 'Add'}</button>
      </div>
    </div>
  );
}
