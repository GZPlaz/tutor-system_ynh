/**
 * People — new sign-ups waiting for approval and everyone else, in one place.
 * Invite tutors/staff, change roles, pause or delete accounts.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Pill, Segmented, useAction, useApi, useToast, type Paged, type Tone } from '../../components/ui';
import { api } from '../../lib/api';
import { allTimeZones, fmtDate } from '../../lib/time';
import { fullName, type Role, type UserRow } from '../../lib/types';

const STATUS: Record<UserRow['status'], { tone: Tone; label: string }> = {
  ACTIVE: { tone: 'good', label: 'Active' },
  PENDING: { tone: 'attention', label: 'Waiting for approval' },
  SUSPENDED: { tone: 'bad', label: 'Paused' },
  REJECTED: { tone: 'neutral', label: 'Not approved' },
};
const FALLBACK_ROLES = [
  { key: 'student', name: 'Student' },
  { key: 'tutor', name: 'Tutor' },
  { key: 'admin', name: 'Administrator' },
];

type Dialog = { kind: 'roles' | 'delete' | 'suspend' | 'reject'; user: UserRow } | { kind: 'invite' } | null;

export function PeoplePage() {
  const { user: me, can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'pending' ? 'pending' : 'all';
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const pending = useApi<Paged<UserRow>>('/users?status=PENDING&pageSize=100');
  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search) qs.set('search', search);
  if (role) qs.set('role', role);
  const everyone = useApi<Paged<UserRow>>(tab === 'all' ? `/users?${qs}` : null);
  const roles = useApi<Role[]>(can('roles:manage') ? '/rbac/roles' : null);
  const roleOptions = roles.data?.map((r) => ({ key: r.key, name: r.name })) ?? FALLBACK_ROLES;
  const pages = Math.max(1, Math.ceil((everyone.data?.total ?? 0) / 25));
  const reloadAll = () => { void pending.reload(); void everyone.reload(); };

  const [act, busy, actError] = useAction(async (u: UserRow, action: 'approve' | 'reactivate') => {
    await api(`/users/${u.id}/${action}`, { method: 'POST', json: {} });
    toast(action === 'approve' ? `${u.firstName} is approved and has been emailed` : `${u.firstName} is active again`);
    reloadAll();
  });

  return (
    <div className="page">
      <PageHeader
        title="People"
        description="Approve new sign-ups, invite tutors, and manage accounts."
        action={can('users:manage') && <Button icon="plus" onClick={() => setDialog({ kind: 'invite' })}>Invite someone</Button>}
      />
      <div className="toolbar">
        <Segmented
          label="People"
          value={tab}
          onChange={(v) => setParams(v === 'pending' ? { tab: 'pending' } : {})}
          options={[{ value: 'pending', label: 'Waiting for approval', count: pending.data?.total }, { value: 'all', label: 'Everyone' }]}
        />
      </div>
      <ErrorText>{actError}</ErrorText>

      {tab === 'pending' ? (
        pending.loading && !pending.data ? <Loading /> : !pending.data?.items.length ? (
          <Empty icon="check" title="All caught up">New sign-ups appear here. You'll also get an email for each one.</Empty>
        ) : (
          <ul className="rows">
            {pending.data.items.map((u) => (
              <li key={u.id} className="row-item">
                <Avatar name={fullName(u)} />
                <span className="row-text">
                  <strong>{fullName(u)}</strong>
                  <small>{u.email} — signed up {fmtDate(u.createdAt)}, time zone {u.timezone}</small>
                </span>
                <span className="row-actions">
                  {can('users:approve') && (
                    <>
                      <Button busy={busy} icon="check" onClick={() => act(u, 'approve')}>Approve</Button>
                      <Button variant="secondary" onClick={() => setDialog({ kind: 'reject', user: u })}>Decline</Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <div className="filters">
            <label className="search-field">
              <Icon name="search" size={18} />
              <input type="search" placeholder="Search by name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search people" />
            </label>
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Filter by role">
              <option value="">All roles</option>
              {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </div>
          {everyone.loading && !everyone.data ? <Loading /> : !everyone.data?.items.length ? (
            <Empty icon="search" title="No one matches">Try a different name, email or role.</Empty>
          ) : (
            <ul className="rows">
              {everyone.data.items.map((u) => (
                <li key={u.id} className="row-item">
                  <Avatar name={fullName(u)} />
                  <span className="row-text">
                    <strong>{fullName(u)} {u.id === me?.id && <span className="muted">(you)</span>}</strong>
                    <small>{u.email}</small>
                  </span>
                  <span className="row-meta">{u.roles.map((r) => r.name).join(', ')}</span>
                  <span className="row-meta"><Pill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Pill></span>
                  <span className="row-actions">
                    {u.status === 'PENDING' && can('users:approve') && <Button busy={busy} onClick={() => act(u, 'approve')}>Approve</Button>}
                    {can('users:manage') && <Button variant="ghost" onClick={() => setDialog({ kind: 'roles', user: u })}>Roles</Button>}
                    {can('users:manage') && u.status === 'ACTIVE' && u.id !== me?.id && <Button variant="ghost" onClick={() => setDialog({ kind: 'suspend', user: u })}>Pause</Button>}
                    {can('users:manage') && u.status === 'SUSPENDED' && <Button variant="ghost" busy={busy} onClick={() => act(u, 'reactivate')}>Reactivate</Button>}
                    {can('users:delete') && u.id !== me?.id && (
                      <button className="icon-btn danger" aria-label={`Delete ${fullName(u)}`} title="Delete account" onClick={() => setDialog({ kind: 'delete', user: u })}>
                        <Icon name="trash" size={18} />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pages > 1 && (
            <div className="pager">
              <Button variant="secondary" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="muted">Page {page} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {dialog?.kind === 'invite' && <InviteDialog roles={roleOptions} onClose={() => setDialog(null)} onDone={(name) => { setDialog(null); toast(`Invitation sent to ${name}`); reloadAll(); }} />}
      {dialog?.kind === 'roles' && <RolesDialog user={dialog.user} roles={roleOptions} onClose={() => setDialog(null)} onDone={() => { setDialog(null); toast('Roles updated'); reloadAll(); }} />}
      {dialog?.kind === 'reject' && (
        <ConfirmDialog title={`Decline ${fullName(dialog.user)}?`} confirmLabel="Decline sign-up" danger reasonLabel="Reason (included in the email, optional)"
          onConfirm={async (reason) => { await api(`/users/${dialog.user.id}/reject`, { method: 'POST', json: { reason } }); toast('Sign-up declined'); reloadAll(); }}
          onClose={() => setDialog(null)}>
          <p>They'll get an email saying their account wasn't approved. You can still approve them later from Everyone.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'suspend' && (
        <ConfirmDialog title={`Pause ${fullName(dialog.user)}'s account?`} confirmLabel="Pause account"
          onConfirm={async () => { await api(`/users/${dialog.user.id}/suspend`, { method: 'POST', json: {} }); toast('Account paused'); reloadAll(); }}
          onClose={() => setDialog(null)}>
          <p>They're signed out everywhere and can't sign in until you reactivate them. Nothing is deleted.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${fullName(dialog.user)}?`} confirmLabel="Delete account" danger
          onConfirm={async () => {
            const r = await api<{ mode: string; cancelledSessions: number }>(`/users/${dialog.user.id}`, { method: 'DELETE' });
            toast(`Account deleted${r.cancelledSessions ? `, ${r.cancelledSessions} upcoming session${r.cancelledSessions > 1 ? 's' : ''} cancelled` : ''}`);
            reloadAll();
          }}
          onClose={() => setDialog(null)}>
          <ul className="consequences">
            <li>Their upcoming sessions are cancelled and the other person is emailed.</li>
            <li>Their availability, classes and uploaded resources are removed.</li>
            <li>Past sessions stay in other people's history as "Deleted user"; their name and email are erased.</li>
          </ul>
          <p><strong>This can't be undone.</strong> To stop someone signing in temporarily, pause the account instead.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function RoleChecks({ roles, value, onChange }: { roles: { key: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="checks">
      <legend>Roles</legend>
      {roles.map((r) => (
        <label key={r.key} className="check">
          <input type="checkbox" checked={value.includes(r.key)} onChange={() => onChange(value.includes(r.key) ? value.filter((k) => k !== r.key) : [...value, r.key])} />
          {r.name}
        </label>
      ))}
    </fieldset>
  );
}

function InviteDialog({ roles, onClose, onDone }: { roles: { key: string; name: string }[]; onClose: () => void; onDone: (name: string) => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', timezone: user?.timezone ?? 'UTC', roles: ['tutor'] });
  const [submit, busy, error] = useAction(async () => {
    await api('/users', { method: 'POST', json: form });
    onDone(form.firstName);
  });
  return (
    <Modal title="Invite someone" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!form.roles.length} onClick={() => submit()} icon="mail">Send invitation</Button></>}>
      <p className="muted">Their account is active straight away. They get an email to choose a password.</p>
      <div className="form-row">
        <label className="field"><span>First name</span><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
        <label className="field"><span>Last name</span><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
      </div>
      <label className="field"><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label className="field">
        <span>Time zone</span>
        <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}</select>
      </label>
      <RoleChecks roles={roles} value={form.roles} onChange={(r) => setForm({ ...form, roles: r })} />
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function RolesDialog({ user, roles, onClose, onDone }: { user: UserRow; roles: { key: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [value, setValue] = useState(user.roles.map((r) => r.key));
  const [save, busy, error] = useAction(async () => {
    await api(`/users/${user.id}/roles`, { method: 'PUT', json: { roles: value } });
    onDone();
  });
  return (
    <Modal title={`Roles for ${fullName(user)}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!value.length} onClick={() => save()}>Save roles</Button></>}>
      <RoleChecks roles={roles} value={value} onChange={setValue} />
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
