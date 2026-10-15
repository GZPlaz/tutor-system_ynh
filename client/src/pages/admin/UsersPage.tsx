/**
 * User directory: search/filter, invite staff or students (active
 * immediately, they receive a set-password email), suspend/reactivate,
 * and change roles — including custom roles.
 */
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Badge, Empty, ErrorText, Loading, Modal, PageHeader, STATUS_TONE, useAction, useApi, type Paged } from '../../components/ui';
import { api } from '../../lib/api';
import { allTimeZones, fmtDate } from '../../lib/time';
import { fullName, type Role, type UserRow, type UserStatus } from '../../lib/types';

const FALLBACK_ROLES = [
  { key: 'student', name: 'Student' },
  { key: 'tutor', name: 'Tutor' },
  { key: 'admin', name: 'Administrator' },
];

export function UsersPage() {
  const { user: me, can } = useAuth();
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [editingRoles, setEditingRoles] = useState<UserRow | null>(null);

  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (status) qs.set('status', status);
  if (role) qs.set('role', role);
  if (search) qs.set('search', search);
  const list = useApi<Paged<UserRow>>(`/users?${qs}`);
  const roles = useApi<Role[]>(can('roles:manage') ? '/rbac/roles' : null);
  const roleOptions = roles.data?.map((r) => ({ key: r.key, name: r.name })) ?? FALLBACK_ROLES;
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 25));

  const [act, busy, actErr] = useAction(async (u: UserRow, action: 'approve' | 'suspend' | 'reactivate') => {
    if (action === 'suspend' && !confirm(`Suspend ${fullName(u)}? They are signed out immediately.`)) return;
    await api(`/users/${u.id}/${action}`, { method: 'POST', json: {} });
    await list.reload();
  });

  return (
    <section>
      <PageHeader title="Users" actions={can('users:manage') && <button onClick={() => setInviting(true)}>Invite user</button>} />
      <div className="row filters">
        <input type="search" placeholder="Search name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value as UserStatus | ''); setPage(1); }}>
          <option value="">All statuses</option>
          {['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>
      <ErrorText>{list.error || actErr}</ErrorText>

      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.items.length ? (
        <Empty>No users match.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Joined</th><th>Last sign-in</th><th /></tr>
            </thead>
            <tbody>
              {list.data.items.map((u) => (
                <tr key={u.id}>
                  <td>{fullName(u)}</td>
                  <td>{u.email}</td>
                  <td>{u.roles.map((r) => r.name).join(', ')}</td>
                  <td><Badge tone={STATUS_TONE[u.status]}>{u.status.toLowerCase()}</Badge></td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>{u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—'}</td>
                  <td className="row end">
                    {(u.status === 'PENDING' || u.status === 'REJECTED') && can('users:approve') && (
                      <button disabled={busy} onClick={() => act(u, 'approve')}>Approve</button>
                    )}
                    {can('users:manage') && (
                      <>
                        <button className="secondary" onClick={() => setEditingRoles(u)}>Roles</button>
                        {u.status === 'ACTIVE' && u.id !== me?.id && (
                          <button className="link danger-text" disabled={busy} onClick={() => act(u, 'suspend')}>Suspend</button>
                        )}
                        {u.status === 'SUSPENDED' && (
                          <button className="secondary" disabled={busy} onClick={() => act(u, 'reactivate')}>Reactivate</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="row end">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted">Page {page} of {pages}</span>
          <button className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}

      {inviting && (
        <InviteDialog roles={roleOptions} onClose={() => setInviting(false)} onDone={() => { setInviting(false); void list.reload(); }} />
      )}
      {editingRoles && (
        <RolesDialog user={editingRoles} roles={roleOptions} onClose={() => setEditingRoles(null)} onDone={() => { setEditingRoles(null); void list.reload(); }} />
      )}
    </section>
  );
}

function RoleChecks({ roles, value, onChange }: { roles: { key: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
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

function InviteDialog({ roles, onClose, onDone }: { roles: { key: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', timezone: user?.timezone ?? 'UTC', roles: ['tutor'] });
  const [submit, busy, error] = useAction(async () => {
    await api('/users', { method: 'POST', json: form });
    onDone();
  });
  return (
    <Modal title="Invite user" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="row">
          <label className="grow">First name<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label className="grow">Last name<input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        </div>
        <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>
          Timezone
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}
          </select>
        </label>
        <RoleChecks roles={roles} value={form.roles} onChange={(r) => setForm({ ...form, roles: r })} />
        <p className="muted small">The account is active immediately; they get an email with a link to set their password.</p>
        <ErrorText>{error}</ErrorText>
        <div className="row end">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button disabled={busy || form.roles.length === 0}>{busy ? 'Sending…' : 'Send invite'}</button>
        </div>
      </form>
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
    <Modal title={`Roles — ${fullName(user)}`} onClose={onClose}>
      <RoleChecks roles={roles} value={value} onChange={setValue} />
      <ErrorText>{error}</ErrorText>
      <div className="row end">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy || value.length === 0} onClick={() => save()}>Save</button>
      </div>
    </Modal>
  );
}
