/**
 * Insights — how the service is doing: headline numbers, completed sessions per week,
 * subjects and tutors, recent feedback, and CSV exports.
 *
 * Chart: one series (completed sessions per week) in the brand colour, so no legend; a
 * hover/focus tooltip on each bar and a table view for screen readers and exact values.
 */
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button, Empty, ErrorText, Loading, PageHeader, Segmented, useAction, useApi } from '../../components/ui';
import { downloadFile } from '../../lib/api';
import type { Insights } from '../../lib/types';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function InsightsPage() {
  const [weeks, setWeeks] = useState<'4' | '12' | '26'>('12');
  const data = useApi<Insights>(`/insights?weeks=${weeks}`);
  const d = data.data;
  const today = new Date().toISOString().slice(0, 10);
  const [exportSessions, exportingSessions, sessionsErr] = useAction(async () => {
    const from = d?.period.from ?? new Date(Date.now() - 90 * 864e5).toISOString();
    await downloadFile(`/insights/export/sessions.csv?from=${encodeURIComponent(from)}`, `sessions-${today}.csv`);
  });
  const [exportPeople, exportingPeople, peopleErr] = useAction(async () => {
    await downloadFile('/insights/export/people.csv', `people-${today}.csv`);
  });

  return (
    <div className="page wide">
      <PageHeader
        title="Insights"
        description="How your tutoring service is doing. Exports include everyone's names and emails; each export is recorded in the activity log."
        action={
          <div className="button-row tight">
            <Button variant="secondary" icon="download" busy={exportingSessions} onClick={() => void exportSessions()}>Sessions CSV</Button>
            <Button variant="secondary" icon="download" busy={exportingPeople} onClick={() => void exportPeople()}>People CSV</Button>
          </div>
        }
      />
      <ErrorText>{data.error || sessionsErr || peopleErr}</ErrorText>
      <div className="toolbar">
        <Segmented label="Period" value={weeks} onChange={setWeeks} options={[{ value: '4', label: 'Last 4 weeks' }, { value: '12', label: '12 weeks' }, { value: '26', label: '6 months' }]} />
      </div>

      {!d ? <Loading /> : (
        <>
          <div className="stat-grid">
            <Stat label="Sessions completed" value={d.totals.completed.toLocaleString()} />
            <Stat label="Coming up (confirmed)" value={d.totals.upcoming.toLocaleString()} />
            <Stat label="Average rating" value={d.totals.averageRating ? `${d.totals.averageRating.toFixed(1)} / 5` : '—'} note={`${d.totals.ratings} rating${d.totals.ratings === 1 ? '' : 's'}`} />
            <Stat label="Missed (no-show)" value={pct(d.totals.missedRate)} note="of sessions that were due to happen" />
            <Stat label="Cancelled or declined" value={pct(d.totals.cancelRate)} note="of booked sessions" />
            <Stat label="Students taught" value={d.totals.activeStudents.toLocaleString()} />
            <Stat label="New accounts" value={d.totals.newPeople.toLocaleString()} />
            <Stat label="Messages sent" value={d.totals.messages.toLocaleString()} />
          </div>

          <section className="panel chart-panel" aria-labelledby="weekly-title">
            <h2 id="weekly-title" className="panel-title">Completed sessions per week</h2>
            <WeeklyBars weeks={d.weekly} />
          </section>

          <div className="insight-columns">
            <section className="panel">
              <h2 className="panel-title">Subjects</h2>
              {d.subjects.length ? (
                <table className="data-table">
                  <thead><tr><th scope="col">Subject</th><th scope="col" className="num">Completed</th><th scope="col" className="num">Booked</th></tr></thead>
                  <tbody>{d.subjects.map((x) => <tr key={x.service}><td>{x.service}</td><td className="num">{x.completed}</td><td className="num">{x.booked}</td></tr>)}</tbody>
                </table>
              ) : <p className="muted">No sessions in this period.</p>}
            </section>
            <section className="panel">
              <h2 className="panel-title">Tutors</h2>
              {d.tutors.length ? (
                <table className="data-table">
                  <thead><tr><th scope="col">Tutor</th><th scope="col" className="num">Completed</th><th scope="col" className="num">Missed</th><th scope="col" className="num">Rating</th></tr></thead>
                  <tbody>{d.tutors.map((x) => (
                    <tr key={x.tutor}><td>{x.tutor}</td><td className="num">{x.completed}</td><td className="num">{x.missed}</td>
                      <td className="num">{x.rating ? <>{x.rating.toFixed(1)} <span className="muted">({x.ratings})</span></> : <span className="muted">—</span>}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="muted">No sessions in this period.</p>}
            </section>
          </div>

          <section className="panel">
            <h2 className="panel-title">Recent feedback</h2>
            {d.recentFeedback.length ? (
              <ul className="feedback-list">
                {d.recentFeedback.map((f, i) => (
                  <li key={i}>
                    <span className="feedback-score" aria-label={`${f.rating} out of 5`}><Icon name="star" size={14} /> {f.rating}</span>
                    <span className="feedback-text">“{f.comment}”<small>{f.service} with {f.tutor} · {shortDate(f.sessionAt)}</small></span>
                  </li>
                ))}
              </ul>
            ) : <Empty title="No written feedback yet">Students can rate a session and leave a comment for 14 days after it ends.</Empty>}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function WeeklyBars({ weeks }: { weeks: Insights['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.completed));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const W = 720, H = 220, L = 32, B = 26, T = 10;
  const bw = (W - L) / weeks.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const labelEvery = weeks.length > 14 ? 4 : weeks.length > 8 ? 2 : 1;
  if (!weeks.some((w) => w.completed)) return <p className="muted">No completed sessions in this period yet.</p>;
  const h = hover === null ? null : weeks[hover];

  return (
    <div className="bars-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="bars" role="img" aria-label={`Completed sessions per week, ${weeks.length} weeks. Highest: ${max}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = L + i * bw + 1;
          const width = Math.max(2, Math.min(bw * 0.55, 28));
          const barX = x + (bw - 2 - width) / 2;
          const top0 = y(w.completed);
          const r = Math.min(4, width / 2, (H - B - top0));
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`Week of ${shortDate(w.weekStart)}: ${w.completed} completed`}>
              <rect x={L + i * bw} y={T} width={bw} height={H - T - B} className="hit" />
              {w.completed > 0 && (
                <path className={`bar ${hover === i ? 'active' : ''}`}
                  d={`M${barX},${H - B} V${top0 + r} Q${barX},${top0} ${barX + r},${top0} H${barX + width - r} Q${barX + width},${top0} ${barX + width},${top0 + r} V${H - B} Z`} />
              )}
              {i % labelEvery === 0 && <text x={barX + width / 2} y={H - 8} textAnchor="middle" className="tick">{shortDate(w.weekStart)}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W} y1={H - B} y2={H - B} className="axis" />
      </svg>
      {h && hover !== null && (
        <div className="bars-tip" style={{ left: `${((L + hover * bw + bw / 2) / W) * 100}%` }} role="status">
          <strong>Week of {shortDate(h.weekStart)}</strong>
          <span>{h.completed} completed</span>
          {h.missed > 0 && <span>{h.missed} missed</span>}
          {h.cancelled > 0 && <span>{h.cancelled} cancelled</span>}
        </div>
      )}
      <details className="howto">
        <summary>Show as a table</summary>
        <table className="data-table">
          <thead><tr><th scope="col">Week starting</th><th scope="col" className="num">Completed</th><th scope="col" className="num">Missed</th><th scope="col" className="num">Cancelled</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.weekStart}><td>{shortDate(w.weekStart)}</td><td className="num">{w.completed}</td><td className="num">{w.missed}</td><td className="num">{w.cancelled}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
