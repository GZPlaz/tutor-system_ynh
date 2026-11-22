/**
 * People — new sign-ups waiting for approval and everyone else, in one place.
 * Invite tutors/staff, change roles, pause or delete accounts.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

type Dialog = { kind: 'roles' | 'delete' | 'suspend' | 'reject' | 'manage'; user: UserRow } | { kind: 'invite' } | null;

export function PeoplePage() {
  const { user: me, can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'pending' ? 'pending' : 'all';
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState('');

  const pending = useApi<Paged<UserRow>>('/users?status=PENDING&pageSize=100');
  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search) qs.set('search', search);
  if (role) qs.set('role', role);
  const everyone = useApi<Paged<UserRow>>(tab === 'all' ? `/users?${qs}` : null);
  const roles = useApi<Role[]>(can('roles:manage') ? '/rbac/roles' : null);
  const roleOptions = roles.data?.map((r) => ({ key: r.key, name: r.name })) ?? FALLBACK_ROLES;
  const pages = Math.max(1, Math.ceil((everyone.data?.total ?? 0) / 25));
  const reloadAll = () => { void pending.reload(); void everyone.reload(); };

  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pageIds = everyone.data?.items.filter((u) => u.id !== me?.id).map((u) => u.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const [runBulk, bulkBusy, bulkError] = useAction(async (action: string, label: string) => {
    if ((action === 'add-role' || action === 'remove-role') && !bulkRole) throw new Error('Choose a role first.');
    const r = await api<{ done: number; failed: { id: string; error: string }[] }>('/users/bulk', { method: 'POST', json: { ids: [...selected], action, roleKey: bulkRole || undefined } });
    toast(`${label}: ${r.done} done${r.failed.length ? `, ${r.failed.length} skipped (${r.failed[0]?.error})` : ''}`);
    setSelected(new Set());
    reloadAll();
  });

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
              {can('users:manage') && (
                <li className="row-item rows-head">
                  <label className="check"><input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? new Set() : new Set(pageIds))} aria-label="Select everyone on this page" /> Select all on this page</label>
                </li>
              )}
              {everyone.data.items.map((u) => (
                <li key={u.id} className={`row-item ${selected.has(u.id) ? 'is-selected' : ''}`}>
                  {can('users:manage') && (
                    <input type="checkbox" className="row-check" checked={selected.has(u.id)} disabled={u.id === me?.id} onChange={() => toggle(u.id)} aria-label={`Select ${fullName(u)}`} />
                  )}
                  <Avatar name={fullName(u)} />
                  <span className="row-text">
                    <Link to={`/admin/people/${u.id}`} className="row-link"><strong>{fullName(u)} {u.id === me?.id && <span className="muted">(you)</span>}</strong></Link>
                    <small>{u.email}</small>
                  </span>
                  <span className="row-meta">{u.roles.map((r) => r.name).join(', ')}</span>
                  <span className="row-meta"><Pill tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Pill></span>
                  <span className="row-actions">
                    {u.status === 'PENDING' && can('users:approve') && <Button busy={busy} onClick={() => act(u, 'approve')}>Approve</Button>}
                    <Link className="btn ghost" to={`/admin/people/${u.id}`}>Open</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {selected.size > 0 && (
            <div className="bulk-bar" role="region" aria-label="Bulk actions">
              <strong>{selected.size} selected</strong>
              <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('send-password-reset', 'Reset links sent')}>Send reset link</Button>
              <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('sign-out', 'Signed out')}>Sign out everywhere</Button>
              <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('unlock', 'Unlocked')}>Unlock</Button>
              <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('suspend', 'Paused')}>Pause</Button>
              <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('reactivate', 'Reactivated')}>Reactivate</Button>
              <span className="bulk-roles">
                <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} aria-label="Role for bulk change">
                  <option value="">Role…</option>
                  {roleOptions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('add-role', 'Role added')}>Add</Button>
                <Button variant="secondary" busy={bulkBusy} onClick={() => void runBulk('remove-role', 'Role removed')}>Remove</Button>
              </span>
              <span className="spacer" />
              <button className="link-btn" onClick={() => setSelected(new Set())}>Clear</button>
              <ErrorText>{bulkError}</ErrorText>
            </div>
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
      {dialog?.kind === 'manage' && <ManageDialog user={dialog.user} isMe={dialog.user.id === me?.id} onClose={() => setDialog(null)} onSaved={(msg) => { toast(msg); reloadAll(); }} />}
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

export function RolesDialog({ user, roles, onClose, onDone }: { user: UserRow; roles: { key: string; name: string }[]; onClose: () => void; onDone: () => void }) {
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

export function ManageDialog({ user, isMe, onClose, onSaved }: { user: UserRow; isMe: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, email: user.email, timezone: user.timezone });
  const [save, saving, saveErr] = useAction(async () => {
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v.trim() !== String(user[k as keyof UserRow] ?? '')));
    if (!Object.keys(changed).length) return onClose();
    await api(`/users/${user.id}`, { method: 'PATCH', json: changed });
    onSaved('email' in changed ? `Saved. ${user.firstName} was signed out everywhere because their email changed.` : 'Details saved');
    onClose();
  });
  const [reset, resetting, resetErr] = useAction(async () => {
    const r = await api<{ email: string }>(`/users/${user.id}/send-password-reset`, { method: 'POST' });
    onSaved(`Password reset link sent to ${r.email}`);
  });
  const [signOut, signingOut, signOutErr] = useAction(async () => {
    await api(`/users/${user.id}/sign-out-everywhere`, { method: 'POST' });
    onSaved(`${user.firstName} was signed out on every device`);
  });
  const formId = 'manage-user';
  return (
    <Modal title={`Manage ${fullName(user)}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button form={formId} busy={saving}>Save details</Button></>}>
      <form id={formId} className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="form-row">
          <label className="field"><span>First name</span><input required maxLength={80} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label className="field"><span>Last name</span><input required maxLength={80} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        </div>
        <label className="field">
          <span>Email</span>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {form.email.trim().toLowerCase() !== user.email && <small className="hint">They will sign in with the new address and be signed out of every device.</small>}
        </label>
        <label className="field">
          <span>Time zone</span>
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}</select>
        </label>
        <ErrorText>{saveErr}</ErrorText>
      </form>
      <div className="manage-actions">
        <div className="manage-action">
          <span><strong>Password reset</strong><small>Email {user.firstName} a link to choose a new password. Their current password keeps working until they use it.</small></span>
          <Button variant="secondary" busy={resetting} onClick={() => void reset()}>Send reset link</Button>
        </div>
        {!isMe && (
          <div className="manage-action">
            <span><strong>Sign out everywhere</strong><small>Ends every session on every device, for example after a lost phone. They can sign in again.</small></span>
            <Button variant="secondary" busy={signingOut} onClick={() => void signOut()}>Sign out</Button>
          </div>
        )}
        <ErrorText>{resetErr || signOutErr}</ErrorText>
      </div>
    </Modal>
  );
}
