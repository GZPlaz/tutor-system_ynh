/**
 * One person, everything about them: account, roles, sessions, reports, notes and recent
 * activity, with every admin action in one place (/admin/people/:id).
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, Pill, useAction, useApi, useToast, type Tone } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/time';
import type { Role, UserRow } from '../../lib/types';
import { ManageDialog, RolesDialog } from './PeoplePage';
import { EmailDialog, SetPasswordDialog } from '../../components/AdminDialogs';

interface Overview {
  user: UserRow & {
    isGuest: boolean; failedLoginCount: number; lockedUntil: string | null; tourCompletedAt: string | null;
    preferences: { emailOnMessage: boolean; emailReminders: boolean }; rejectionReason: string | null; approvedBy: string | null;
    approvedAt: string | null; lastLoginAt: string | null; createdAt: string;
  };
  sessions: { asStudent: Record<string, number>; asTutor: Record<string, number> };
  upcoming: { id: string; startsAt: string; status: string; service: string; role: 'student' | 'tutor'; with: string }[];
  reports: { id: string; category: string; status: string; createdAt: string }[] | null;
  notes: number;
  activity: { id: string; action: string; at: string; byThem: boolean; actor: string }[] | null;
}

const STATUS_TONE: Record<string, Tone> = { ACTIVE: 'good', PENDING: 'attention', SUSPENDED: 'bad', REJECTED: 'neutral' };
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', PENDING: 'Waiting for approval', SUSPENDED: 'Paused', REJECTED: 'Declined' };
const human = (action: string) => action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

type Dialog = 'edit' | 'roles' | 'suspend' | 'delete' | 'cancel' | 'email' | 'password' | null;

export function PersonPage() {
  const { id } = useParams();
  const { user: me, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useApi<Overview>(id ? `/users/${id}/overview` : null);
  const roles = useApi<Role[]>(can('roles:manage') ? '/rbac/roles' : null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const d = data.data;
  const u = d?.user;
  const isMe = u?.id === me?.id;
  const tz = me?.timezone;

  const [act, busy, actError] = useAction(async (path: string, done: string, body?: unknown) => {
    await api(`/users/${id}/${path}`, { method: 'POST', json: body ?? {} });
    toast(done);
    void data.reload();
  });

  if (data.loading && !d) return <div className="page"><Loading /></div>;
  if (!d || !u) return <div className="page"><Empty icon="user" title="Person not found">{data.error}</Empty></div>;
  const first = u.firstName;
  const studentTotal = sum(d.sessions.asStudent);
  const tutorTotal = sum(d.sessions.asTutor);
  const roleOptions = roles.data?.map((r) => ({ key: r.key, name: r.name })) ?? u.roles;

  return (
    <div className="page">
      <Link to="/admin/people" className="back-link"><Icon name="chevronLeft" size={16} /> People</Link>
      <header className="profile-head">
        <Avatar name={`${u.firstName} ${u.lastName}`} size={56} />
        <div>
          <h1>{u.firstName} {u.lastName} {isMe && <span className="muted">(you)</span>}</h1>
          <p className="muted">{u.email} · {u.roles.map((r) => r.name).join(', ') || 'No role'}</p>
        </div>
        <span className="spacer" />
        <Pill tone={STATUS_TONE[u.status] ?? 'neutral'}>{STATUS_LABEL[u.status] ?? u.status}</Pill>
      </header>

      {u.lockedUntil && (
        <div className="notice warn row-between">
          <span><strong>Locked out</strong> after too many wrong passwords, until {fmtDateTime(u.lockedUntil, tz)}.</span>
          {can('users:manage') && <Button variant="secondary" busy={busy} onClick={() => void act('unlock', `${first} can sign in again`)}>Unlock now</Button>}
        </div>
      )}
      <ErrorText>{actError}</ErrorText>

      <div className="person-grid">
        <div className="person-main">
          <section className="panel">
            <h2 className="panel-title">Account</h2>
            <dl className="facts">
              <div><dt>Joined</dt><dd>{fmtDate(u.createdAt, tz)}</dd></div>
              <div><dt>Last sign-in</dt><dd>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt, tz) : 'Never'}</dd></div>
              <div><dt>Time zone</dt><dd>{u.timezone}</dd></div>
              {u.approvedBy && <div><dt>Approved by</dt><dd>{u.approvedBy}{u.approvedAt ? `, ${fmtDate(u.approvedAt, tz)}` : ''}</dd></div>}
              {u.rejectionReason && <div><dt>Declined because</dt><dd>{u.rejectionReason}</dd></div>}
              <div><dt>Emails</dt><dd>Messages {u.preferences.emailOnMessage ? 'on' : 'off'} · Reminders {u.preferences.emailReminders ? 'on' : 'off'}</dd></div>
              <div><dt>Welcome tour</dt><dd>{u.tourCompletedAt ? `Seen ${fmtDate(u.tourCompletedAt, tz)}` : 'Not seen yet'}</dd></div>
              <div><dt>Failed sign-ins</dt><dd>{u.failedLoginCount}</dd></div>
            </dl>
          </section>

          <section className="panel">
            <h2 className="panel-title">Sessions</h2>
            <div className="mini-stats">
              {tutorTotal > 0 && <div><strong>{d.sessions.asTutor.COMPLETED ?? 0}</strong><span>taught</span></div>}
              {tutorTotal > 0 && <div><strong>{d.sessions.asTutor.NO_SHOW ?? 0}</strong><span>students missed</span></div>}
              {studentTotal > 0 && <div><strong>{d.sessions.asStudent.COMPLETED ?? 0}</strong><span>attended</span></div>}
              {studentTotal > 0 && <div><strong>{d.sessions.asStudent.NO_SHOW ?? 0}</strong><span>missed</span></div>}
              <div><strong>{d.upcoming.length}</strong><span>coming up</span></div>
            </div>
            {d.upcoming.length > 0 && (
              <table className="data-table">
                <thead><tr><th>When</th><th>Subject</th><th>As</th><th>With</th><th>Status</th></tr></thead>
                <tbody>{d.upcoming.map((b) => (
                  <tr key={b.id}><td>{fmtDateTime(b.startsAt, tz)}</td><td>{b.service}</td><td>{b.role === 'tutor' ? 'Tutor' : 'Student'}</td><td>{b.with}</td><td>{b.status === 'PENDING' ? 'Requested' : 'Confirmed'}</td></tr>
                ))}</tbody>
              </table>
            )}
          </section>

          {d.reports && d.reports.length > 0 && (
            <section className="panel">
              <h2 className="panel-title">Reports about {first}</h2>
              <ul className="plain-list">{d.reports.map((r) => (
                <li key={r.id}><span>{fmtDate(r.createdAt, tz)} · {r.category.replace('_', '-').toLowerCase()}</span><Pill tone={r.status === 'OPEN' ? 'attention' : r.status === 'RESOLVED' ? 'good' : 'neutral'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Pill></li>
              ))}</ul>
              <Link to="/admin/reports" className="link-btn">Go to reports</Link>
            </section>
          )}

          {d.activity && (
            <section className="panel">
              <h2 className="panel-title">Recent activity</h2>
              {!d.activity.length ? <p className="muted">Nothing recorded yet.</p> : (
                <ul className="activity-list">{d.activity.map((a) => (
                  <li key={a.id}><time>{fmtDateTime(a.at, tz)}</time><span>{human(a.action)}{a.byThem ? '' : <span className="muted"> · by {a.actor}</span>}</span></li>
                ))}</ul>
              )}
            </section>
          )}
        </div>

        <aside className="person-side">
          <section className="panel action-panel">
            <h2 className="panel-title">Actions</h2>
            {can('email:send') && <Button variant="secondary" className="block" icon="mail" onClick={() => setDialog('email')}>Send an email</Button>}
            {can('users:manage') && <Button variant="secondary" className="block" onClick={() => setDialog('edit')}>Edit details or send reset link</Button>}
            {can('users:manage') && !u.isGuest && <Button variant="secondary" className="block" onClick={() => setDialog('password')}>Set a new password</Button>}
            {can('users:manage') && <Button variant="secondary" className="block" onClick={() => setDialog('roles')}>Change roles</Button>}
            {can('messages:read_any') && <Link className="btn secondary block" to="/messages?scope=all">Review messages</Link>}
            {d.notes > 0 && can('students:read_notes') && <Link className="btn secondary block" to={`/students/${u.id}`}>Tutor notes ({d.notes})</Link>}
            {can('users:manage') && !isMe && <Button variant="secondary" className="block" busy={busy} onClick={() => void act('sign-out-everywhere', `${first} was signed out everywhere`)}>Sign out everywhere</Button>}
            {can('users:manage') && <Button variant="secondary" className="block" busy={busy} onClick={() => void act('reset-tour', `${first} will see the tour next time`)}>Show the tour again</Button>}
            {u.status === 'PENDING' && can('users:approve') && <Button className="block" busy={busy} onClick={() => void act('approve', `${first} is approved`)}>Approve</Button>}
            <div className="danger-zone">
              {can('bookings:manage_any') && d.upcoming.length > 0 && <Button variant="secondary" className="block" onClick={() => setDialog('cancel')}>Cancel upcoming sessions</Button>}
              {can('users:manage') && !isMe && u.status === 'ACTIVE' && <Button variant="secondary" className="block" onClick={() => setDialog('suspend')}>Pause account</Button>}
              {can('users:manage') && u.status === 'SUSPENDED' && <Button className="block" busy={busy} onClick={() => void act('reactivate', `${first} is active again`)}>Reactivate account</Button>}
              {can('users:delete') && !isMe && <Button variant="danger" className="block" onClick={() => setDialog('delete')}>Delete account</Button>}
            </div>
          </section>
        </aside>
      </div>

      {dialog === 'edit' && <ManageDialog user={u} isMe={isMe} onClose={() => setDialog(null)} onSaved={(msg) => { toast(msg); void data.reload(); }} />}
      {dialog === 'email' && <EmailDialog recipients={[{ id: u.id, name: `${u.firstName} ${u.lastName}` }]} onClose={() => setDialog(null)} onSent={() => { setDialog(null); toast(`Email sent to ${first}`); void data.reload(); }} />}
      {dialog === 'password' && <SetPasswordDialog person={u} onClose={() => setDialog(null)} onDone={() => { setDialog(null); toast(`New password set — ${first} was signed out everywhere`); void data.reload(); }} />}
      {dialog === 'roles' && <RolesDialog user={u} roles={roleOptions} onClose={() => setDialog(null)} onDone={() => { setDialog(null); toast('Roles updated'); void data.reload(); }} />}
      {dialog === 'suspend' && (
        <ConfirmDialog title={`Pause ${first}'s account?`} confirmLabel="Pause account" danger onClose={() => setDialog(null)}
          onConfirm={async () => { await api(`/users/${u.id}/suspend`, { method: 'POST', json: {} }); toast(`${first}'s account is paused`); void data.reload(); }}>
          <p>{first} is signed out at once and can't sign in until you reactivate the account. Their sessions are not cancelled; use "Cancel upcoming sessions" for that.</p>
        </ConfirmDialog>
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog title={`Cancel ${d.upcoming.length} upcoming session${d.upcoming.length > 1 ? 's' : ''}?`} confirmLabel="Cancel sessions" danger onClose={() => setDialog(null)}
          onConfirm={async () => {
            const r = await api<{ cancelled: number }>(`/users/${u.id}/cancel-upcoming`, { method: 'POST', json: { reason: reason.trim() || 'Cancelled by the team' } });
            toast(`${r.cancelled} session${r.cancelled === 1 ? '' : 's'} cancelled; everyone was emailed`);
            void data.reload();
          }}>
          <p>Everyone in these sessions is emailed.</p>
          <label className="field"><span>Reason shown in the email</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancelled by the team" maxLength={500} /></label>
        </ConfirmDialog>
      )}
      {dialog === 'delete' && (
        <ConfirmDialog title={`Delete ${first}'s account?`} confirmLabel="Delete account" danger onClose={() => setDialog(null)}
          onConfirm={async () => { await api(`/users/${u.id}`, { method: 'DELETE' }); toast('Account deleted'); navigate('/admin/people'); }}>
          <p>Upcoming sessions are cancelled and everyone is emailed. Past sessions keep their history under "Deleted user". This can't be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
