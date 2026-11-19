/**
 * My availability — the weekly hours students can book (in the tutor's own
 * time zone), plus one-off time off or extra hours.
 * Staff with availability:manage_any can switch to any tutor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Section } from '../components/Shell';
import { Button, Empty, ErrorText, Loading, Modal, PageHeader, Pill, useAction, useApi, useToast, type Paged } from '../components/ui';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { WEEKDAYS, allTimeZones, fmtDateTime, hhmmToMinutes, minutesToHHMM, zonedToUtc } from '../lib/time';
import { fullName, type AvailabilityException, type AvailabilityRule, type UserRow } from '../lib/types';

interface Range { key: number; start: string; end: string }
let seq = 0;
type Week = Record<number, Range[]>; // weekday 1..7

const toMin = (r: Range) => ({ start: hhmmToMinutes(r.start), end: r.end === '00:00' ? 1440 : hhmmToMinutes(r.end) });

export function AvailabilityPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const canAny = can('availability:manage_any');
  const tutors = useApi<Paged<UserRow>>(canAny ? '/users?role=tutor&status=ACTIVE&pageSize=100' : null);
  const [tutorId, setTutorId] = useState(user?.id ?? '');
  const data = useApi<{ rules: AvailabilityRule[]; exceptions: AvailabilityException[] }>(tutorId ? `/scheduling/availability/${tutorId}` : null);
  const [week, setWeek] = useState<Week>({});
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [dirty, setDirty] = useState(false);
  const [addingException, setAddingException] = useState(false);

  useEffect(() => {
    if (!data.data) return;
    const w: Week = {};
    for (const r of data.data.rules) (w[r.weekday] ??= []).push({ key: ++seq, start: minutesToHHMM(r.startMinute), end: minutesToHHMM(r.endMinute) });
    setWeek(w);
    setTimezone(data.data.rules[0]?.timezone ?? user?.timezone ?? 'UTC');
    setDirty(false);
  }, [data.data, user?.timezone]);

  const update = (fn: (w: Week) => Week) => { setWeek(fn); setDirty(true); };
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const [wd, ranges] of Object.entries(week)) {
      const sorted = ranges.map(toMin).sort((a, b) => a.start - b.start);
      sorted.forEach((r, i) => {
        if (r.start >= r.end) out.push(`${WEEKDAYS[Number(wd) - 1]}: a block ends before it starts.`);
        const next = sorted[i + 1];
        if (next && next.start < r.end) out.push(`${WEEKDAYS[Number(wd) - 1]}: two blocks overlap.`);
      });
    }
    return [...new Set(out)];
  }, [week]);

  const [save, saving, saveError] = useAction(async () => {
    const rules = Object.entries(week).flatMap(([wd, ranges]) => ranges.map((r) => ({ weekday: Number(wd), startMinute: toMin(r).start, endMinute: toMin(r).end, timezone })));
    await api(`/scheduling/availability/${tutorId}/rules`, { method: 'PUT', json: { rules } });
    toast('Weekly hours saved');
    setDirty(false);
    await data.reload();
  });
  const [removeException, , removeError] = useAction(async (id: string) => {
    await api(`/scheduling/availability/exceptions/${id}`, { method: 'DELETE' });
    toast('Removed');
    await data.reload();
  });

  const hoursPerWeek = Object.values(week).flat().reduce((sum, r) => sum + Math.max(0, toMin(r).end - toMin(r).start), 0) / 60;

  return (
    <div className="page">
      <PageHeader
        title={tutorId === user?.id ? 'My availability' : 'Availability'}
        description="Students can request any time inside these hours, unless it's already booked."
        action={<Button busy={saving} disabled={!dirty || problems.length > 0} onClick={() => save()}>{dirty ? 'Save weekly hours' : 'Saved'}</Button>}
      />

      {canAny && (
        <label className="field inline-field">
          <span>Tutor</span>
          <select value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            {user && <option value={user.id}>Me</option>}
            {tutors.data?.items.filter((t) => t.id !== user?.id).map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}
          </select>
        </label>
      )}

      <ErrorText>{data.error || saveError || removeError}</ErrorText>
      {data.loading && !data.data ? <Loading /> : (
        <>
          <Section title="Weekly hours" action={<span className="muted">{hoursPerWeek ? `${hoursPerWeek % 1 ? hoursPerWeek.toFixed(1) : hoursPerWeek} hours a week` : 'Not available yet'}</span>}>
            <div className="panel">
              <label className="field inline-field">
                <span>Time zone</span>
                <select value={timezone} onChange={(e) => { setTimezone(e.target.value); setDirty(true); }}>{allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}</select>
              </label>
              <ul className="week">
                {WEEKDAYS.map((name, i) => {
                  const wd = i + 1;
                  const ranges = week[wd] ?? [];
                  const on = ranges.length > 0;
                  return (
                    <li key={name} className={`week-day ${on ? 'on' : ''}`}>
                      <label className="switch">
                        <input type="checkbox" checked={on} onChange={() => update((w) => ({ ...w, [wd]: on ? [] : [{ key: ++seq, start: '09:00', end: '17:00' }] }))} />
                        <span className="switch-track" aria-hidden />
                        <span className="week-name">{name}</span>
                      </label>
                      <div className="ranges">
                        {!on && <span className="muted">Unavailable</span>}
                        {ranges.map((r) => (
                          <div key={r.key} className="range">
                            <input type="time" step={900} value={r.start} aria-label={`${name} start`} onChange={(e) => update((w) => ({ ...w, [wd]: (w[wd] ?? []).map((x) => (x.key === r.key ? { ...x, start: e.target.value } : x)) }))} />
                            <span className="muted">to</span>
                            <input type="time" step={900} value={r.end} aria-label={`${name} end`} onChange={(e) => update((w) => ({ ...w, [wd]: (w[wd] ?? []).map((x) => (x.key === r.key ? { ...x, end: e.target.value } : x)) }))} />
                            <button className="icon-btn" aria-label={`Remove ${name} block`} onClick={() => update((w) => ({ ...w, [wd]: (w[wd] ?? []).filter((x) => x.key !== r.key) }))}><Icon name="x" size={18} /></button>
                          </div>
                        ))}
                        {on && <button className="link-btn" onClick={() => update((w) => ({ ...w, [wd]: [...(w[wd] ?? []), { key: ++seq, start: '18:00', end: '20:00' }] }))}>Add another block</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {problems.map((p) => <p key={p} className="error-text"><Icon name="alert" size={18} /> {p}</p>)}
              <div className="panel-foot">
                <button className="link-btn" onClick={() => update((w) => ({ ...w, ...Object.fromEntries([2, 3, 4, 5].map((d) => [d, (w[1] ?? []).map((r) => ({ ...r, key: ++seq }))])) }))}>Copy Monday to Tuesday–Friday</button>
                <span className="muted">Use 00:00 as the end time to mean midnight.</span>
              </div>
            </div>
          </Section>

          <Section title="Time off and extra hours" action={<Button variant="secondary" icon="plus" onClick={() => setAddingException(true)}>Add</Button>}>
            {!data.data?.exceptions.length ? (
              <Empty icon="calendar" title="No time off planned">Going away, or free for extra hours one week? Add it here and it overrides your weekly hours.</Empty>
            ) : (
              <ul className="rows">
                {data.data.exceptions.map((x) => (
                  <li key={x.id} className="row-item">
                    <Pill tone={x.isAvailable ? 'good' : 'neutral'}>{x.isAvailable ? 'Extra hours' : 'Time off'}</Pill>
                    <span className="row-text">
                      <strong>{fmtDateTime(x.startsAt, user?.timezone)} – {fmtDateTime(x.endsAt, user?.timezone)}</strong>
                      {x.reason && <small>{x.reason}</small>}
                    </span>
                    <span className="row-actions"><Button variant="ghost" onClick={() => removeException(x.id)}>Remove</Button></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {addingException && <ExceptionDialog tutorId={tutorId} timezone={timezone} onClose={() => setAddingException(false)} onDone={() => { setAddingException(false); toast('Added'); void data.reload(); }} />}
    </div>
  );
}

function ExceptionDialog({ tutorId, timezone, onClose, onDone }: { tutorId: string; timezone: string; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ kind: 'off' as 'off' | 'extra', from: today, until: today, allDay: true, start: '09:00', end: '17:00', reason: '' });
  const [submit, busy, error] = useAction(async () => {
    const startsAt = zonedToUtc(f.from, f.allDay ? '00:00' : f.start, timezone);
    const endsAt = f.allDay
      ? zonedToUtc(new Date(Date.parse(`${f.until}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), '00:00', timezone)
      : zonedToUtc(f.from, f.end, timezone);
    await api(`/scheduling/availability/${tutorId}/exceptions`, {
      method: 'POST',
      json: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), isAvailable: f.kind === 'extra', reason: f.reason || undefined },
    });
    onDone();
  });
  return (
    <Modal title="Add time off or extra hours" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => submit()}>Add</Button></>}>
      <div className="option-row">
        <label className={`option-chip ${f.kind === 'off' ? 'selected' : ''}`}><input type="radio" checked={f.kind === 'off'} onChange={() => setF({ ...f, kind: 'off' })} /> Time off</label>
        <label className={`option-chip ${f.kind === 'extra' ? 'selected' : ''}`}><input type="radio" checked={f.kind === 'extra'} onChange={() => setF({ ...f, kind: 'extra', allDay: false })} /> Extra hours</label>
      </div>
      <label className="check"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> Whole days</label>
      {f.allDay ? (
        <div className="form-row">
          <label className="field"><span>From</span><input type="date" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, until: e.target.value > f.until ? e.target.value : f.until })} /></label>
          <label className="field"><span>Until (including)</span><input type="date" min={f.from} value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} /></label>
        </div>
      ) : (
        <div className="form-row">
          <label className="field"><span>Date</span><input type="date" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="field"><span>From</span><input type="time" step={900} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label className="field"><span>To</span><input type="time" step={900} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
      )}
      <label className="field"><span>Note (optional, only you see it)</span><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Holiday" /></label>
      <p className="hint">Times are in {timezone}. {f.kind === 'off' ? 'Already-booked sessions are not cancelled automatically.' : ''}</p>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
