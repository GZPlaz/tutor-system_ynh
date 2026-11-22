/** Reports about tutors — the safety queue. Admins review, add an internal note, and resolve. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button, Empty, ErrorText, Loading, PageHeader, Pill, Segmented, useAction, useApi, useToast, type Tone } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/time';

type Status = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
interface Report {
  id: string; category: string; categoryLabel: string; details: string; status: Status; adminNote: string | null;
  createdAt: string; handledAt: string | null; handledBy: string | null;
  tutor: { id: string; name: string; status: string }; reporter: { id: string; name: string; email: string };
  booking: { id: string; startsAt: string; service: string } | null;
}
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'attention' },
  REVIEWING: { label: 'Reviewing', tone: 'brand' },
  RESOLVED: { label: 'Resolved', tone: 'good' },
  DISMISSED: { label: 'Dismissed', tone: 'neutral' },
};

export function ReportsPage() {
  const [status, setStatus] = useState<Status>('OPEN');
  const data = useApi<{ counts: Partial<Record<Status, number>>; items: Report[] }>(`/reports?status=${status}`);
  const counts = data.data?.counts ?? {};
  return (
    <div className="page">
      <PageHeader title="Reports" description="Reports about tutors from students and others. Reporters' names are visible to admins only. Tutors are never told who reported them." />
      <div className="toolbar">
        <Segmented label="Status" value={status} onChange={setStatus}
          options={(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as Status[]).map((s) => ({ value: s, label: STATUS[s].label, count: s === 'OPEN' || s === 'REVIEWING' ? counts[s] : undefined }))} />
      </div>
      <ErrorText>{data.error}</ErrorText>
      {data.loading && !data.data ? <Loading /> : !data.data?.items.length ? (
        <Empty icon="shield" title={status === 'OPEN' ? 'No open reports' : `No ${STATUS[status].label.toLowerCase()} reports`}>
          {status === 'OPEN' ? "Nothing needs your attention. New reports also arrive by email." : 'Reports appear here when they move to this status.'}
        </Empty>
      ) : (
        <div className="report-list">{data.data.items.map((r) => <ReportCard key={r.id} r={r} onChanged={() => void data.reload()} />)}</div>
      )}
    </div>
  );
}

function ReportCard({ r, onChanged }: { r: Report; onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [note, setNote] = useState(r.adminNote ?? '');
  const [next, setNext] = useState<Status>(r.status);
  const [save, busy, error] = useAction(async () => {
    await api(`/reports/${r.id}`, { method: 'PATCH', json: { status: next !== r.status ? next : undefined, adminNote: note.trim() || null } });
    toast(next !== r.status ? `Report marked ${STATUS[next].label.toLowerCase()}` : 'Note saved');
    onChanged();
  });
  const tz = user?.timezone;
  return (
    <article className="panel report">
      <header className="report-head">
        <div>
          <h2><Link to={`/admin/people/${r.tutor.id}`}>{r.tutor.name}</Link> <span className="muted">· {r.categoryLabel}</span></h2>
          <p className="muted small">
            Reported by <Link to={`/admin/people/${r.reporter.id}`}>{r.reporter.name}</Link> ({r.reporter.email}) on {fmtDateTime(r.createdAt, tz)}
            {r.booking && <> · about {r.booking.service} on {fmtDate(r.booking.startsAt, tz)}</>}
          </p>
        </div>
        <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
      </header>
      <blockquote className="report-body">{r.details}</blockquote>
      {r.tutor.status !== 'ACTIVE' && <p className="small"><Pill>Tutor account {r.tutor.status.toLowerCase()}</Pill></p>}
      <div className="report-actions">
        <label className="field">
          <span>Internal note (admins only)</span>
          <textarea rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you did, who you spoke to…" />
        </label>
        <div className="button-row">
          <label className="inline-select">
            <span>Status</span>
            <select value={next} onChange={(e) => setNext(e.target.value as Status)}>
              {(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </label>
          <Button busy={busy} onClick={() => void save()}>Save</Button>
          <span className="spacer" />
          <Link className="btn ghost" to={`/admin/people/${r.tutor.id}`}>Open tutor's account</Link>
        </div>
        {r.handledBy && <p className="muted small">Last updated by {r.handledBy}{r.handledAt ? ` on ${fmtDateTime(r.handledAt, tz)}` : ''}.</p>}
        <ErrorText>{error}</ErrorText>
      </div>
    </article>
  );
}
