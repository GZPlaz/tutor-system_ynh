/**
 * Students — for tutors (and admins): the students you teach, and each student's profile
 * with notes every tutor can read. Notes are either shared with the student or tutors-only.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, PageHeader, Pill, Segmented, useAction, useApi, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/time';

interface StudentRow { id: string; name: string; email?: string; status: string; notes: number; sessionsWithMe: number; next: { startsAt: string; service: string } | null }
interface Note { id: string; body: string; visibility: 'SHARED' | 'TUTORS_ONLY'; createdAt: string; updatedAt: string; author: string; mine: boolean; canEdit: boolean }
interface Profile {
  student: { id: string; name: string; email?: string; timezone: string; status: string; memberSince: string };
  notes: Note[];
  sessions: { id: string; startsAt: string; status: string; service: string; tutor: string; hasRecap: boolean; rating: number | null }[];
  sessionsScope: 'mine' | 'all';
  canWrite: boolean;
}

export function StudentsPage() {
  const { can, user } = useAuth();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [search, setSearch] = useState('');
  const list = useApi<StudentRow[]>(`/students?scope=${scope}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`);
  return (
    <div className="page">
      <PageHeader title="Students" description="The students you teach. Open a student to see notes from every tutor and add your own." />
      <div className="toolbar">
        {can('users:read') && <Segmented label="Which students" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My students' }, { value: 'all', label: 'All students' }]} />}
        <label className="search-field">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
        </label>
      </div>
      <ErrorText>{list.error}</ErrorText>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? (
        <Empty icon="users" title={search ? 'No students match' : 'No students yet'}>
          {search ? 'Try a different name.' : 'Students appear here once they book a session with you.'}
        </Empty>
      ) : (
        <ul className="rows">
          {list.data.map((s) => (
            <li key={s.id} className="row-item">
              <Avatar name={s.name} size={34} />
              <span className="row-text">
                <Link to={`/students/${s.id}`} className="row-link"><strong>{s.name}</strong></Link>
                <small>{s.next ? `Next: ${s.next.service}, ${fmtDate(s.next.startsAt, user?.timezone)}` : 'No upcoming session'}{s.email ? ` · ${s.email}` : ''}</small>
              </span>
              <span className="row-meta">{s.sessionsWithMe} session{s.sessionsWithMe === 1 ? '' : 's'} with you</span>
              <span className="row-meta">{s.notes ? `${s.notes} note${s.notes === 1 ? '' : 's'}` : <span className="muted">No notes</span>}</span>
              <Link to={`/students/${s.id}`} className="btn ghost">Open</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StudentProfilePage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const toast = useToast();
  const profile = useApi<Profile>(id ? `/students/${id}` : null);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'TUTORS_ONLY' | 'SHARED'>('TUTORS_ONLY');
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const p = profile.data;

  const [add, adding, addError] = useAction(async () => {
    await api(`/students/${id}/notes`, { method: 'POST', json: { body: body.trim(), visibility } });
    setBody('');
    toast(visibility === 'SHARED' ? 'Note added — the student can see it' : 'Note added — visible to tutors only');
    void profile.reload();
  });
  const [save, saving, saveError] = useAction(async () => {
    if (!editing) return;
    await api(`/students/notes/${editing.id}`, { method: 'PATCH', json: { body: editing.body.trim(), visibility: editing.visibility } });
    setEditing(null);
    toast('Note updated');
    void profile.reload();
  });

  if (profile.loading && !p) return <div className="page"><Loading /></div>;
  if (!p) return <div className="page"><Empty icon="user" title="Student not found">{profile.error}</Empty></div>;
  const first = p.student.name.split(' ')[0];

  return (
    <div className="page">
      <Link to="/students" className="back-link"><Icon name="chevronLeft" size={16} /> Students</Link>
      <header className="profile-head">
        <Avatar name={p.student.name} size={52} />
        <div>
          <h1>{p.student.name}</h1>
          <p className="muted">{p.student.email ? `${p.student.email} · ` : ''}{p.student.timezone} · joined {fmtDate(p.student.memberSince, user?.timezone)}</p>
        </div>
        <span className="spacer" />
        {can('messages:send') && <Link className="btn secondary" to={`/messages?with=${p.student.id}&as=student`}><Icon name="message" size={16} /> Message</Link>}
        {can('users:manage') && <Link className="btn secondary" to={`/admin/people/${p.student.id}`}>Account</Link>}
      </header>

      <section className="section">
        <div className="section-head"><h2>Notes from tutors</h2><span className="muted small">Every tutor can read these.</span></div>
        {p.canWrite && (
          <form className="panel note-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <label className="sr-only" htmlFor="new-note">New note</label>
            <textarea id="new-note" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Add a note about ${first}: strengths, what to work on, how they learn best…`} />
            <div className="note-form-foot">
              <div className="segmented-inline" role="radiogroup" aria-label="Who can see this note">
                <label className={visibility === 'TUTORS_ONLY' ? 'on' : ''}><input type="radio" name="vis" checked={visibility === 'TUTORS_ONLY'} onChange={() => setVisibility('TUTORS_ONLY')} /> Tutors only</label>
                <label className={visibility === 'SHARED' ? 'on' : ''}><input type="radio" name="vis" checked={visibility === 'SHARED'} onChange={() => setVisibility('SHARED')} /> Also visible to {first}</label>
              </div>
              <Button busy={adding} disabled={!body.trim()}>Add note</Button>
            </div>
            <ErrorText>{addError}</ErrorText>
          </form>
        )}
        {!p.notes.length ? (
          <p className="muted empty-line">No notes yet.</p>
        ) : (
          <ul className="notes">
            {p.notes.map((n) => (
              <li key={n.id} className="note">
                {editing?.id === n.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="note-edit">
                    <textarea rows={3} maxLength={4000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                    <div className="note-form-foot">
                      <div className="segmented-inline" role="radiogroup" aria-label="Who can see this note">
                        <label className={editing.visibility === 'TUTORS_ONLY' ? 'on' : ''}><input type="radio" checked={editing.visibility === 'TUTORS_ONLY'} onChange={() => setEditing({ ...editing, visibility: 'TUTORS_ONLY' })} /> Tutors only</label>
                        <label className={editing.visibility === 'SHARED' ? 'on' : ''}><input type="radio" checked={editing.visibility === 'SHARED'} onChange={() => setEditing({ ...editing, visibility: 'SHARED' })} /> Also visible to {first}</label>
                      </div>
                      <div className="button-row tight"><Button variant="ghost" type="button" onClick={() => setEditing(null)}>Cancel</Button><Button busy={saving}>Save</Button></div>
                    </div>
                    <ErrorText>{saveError}</ErrorText>
                  </form>
                ) : (
                  <>
                    <div className="note-head">
                      <strong>{n.author}</strong>
                      <span className="muted">{fmtDateTime(n.createdAt, user?.timezone)}{n.updatedAt !== n.createdAt ? ' · edited' : ''}</span>
                      {n.visibility === 'SHARED' ? <Pill tone="brand">Visible to {first}</Pill> : <Pill>Tutors only</Pill>}
                      <span className="spacer" />
                      {n.canEdit && <button className="link-btn" onClick={() => setEditing(n)}>Edit</button>}
                      {n.canEdit && <button className="link-btn danger-link" onClick={() => setDeleting(n)}>Delete</button>}
                    </div>
                    <p>{n.body}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>{p.sessionsScope === 'all' ? 'Sessions' : 'Sessions with you'}</h2></div>
        {!p.sessions.length ? <p className="muted empty-line">No sessions yet.</p> : (
          <table className="data-table panel-table">
            <thead><tr><th>Date</th><th>Subject</th>{p.sessionsScope === 'all' && <th>Tutor</th>}<th>Status</th><th>Recap</th><th className="num">Rating</th></tr></thead>
            <tbody>
              {p.sessions.map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.startsAt, user?.timezone)}</td><td>{s.service}</td>{p.sessionsScope === 'all' && <td>{s.tutor}</td>}
                  <td>{s.status.charAt(0) + s.status.slice(1).toLowerCase().replace('_', '-')}</td>
                  <td>{s.hasRecap ? 'Written' : <span className="muted">—</span>}</td>
                  <td className="num">{s.rating ? `${s.rating} / 5` : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {deleting && (
        <ConfirmDialog title="Delete this note?" confirmLabel="Delete note" danger onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/students/notes/${deleting.id}`, { method: 'DELETE' }); toast('Note deleted'); void profile.reload(); }}>
          <p>It is removed for every tutor{deleting.visibility === 'SHARED' ? ` and for ${first}` : ''}.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
