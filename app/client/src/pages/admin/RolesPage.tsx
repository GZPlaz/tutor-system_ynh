/**
 * Roles — create custom account types (e.g. "Parent") and choose what they
 * can do. The permission list comes from the server, grouped by area.
 */
import { useState } from 'react';
import { Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Pill, useAction, useApi, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { Role } from '../../lib/types';

type Catalog = Record<string, { key: string; description: string }[]>;

export function RolesPage() {
  const toast = useToast();
  const roles = useApi<Role[]>('/rbac/roles');
  const catalog = useApi<Catalog>('/rbac/permissions');
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const blank: Role = { id: '', key: '', name: '', description: '', isSystem: false, permissions: [], userCount: 0 };

  return (
    <div className="page">
      <PageHeader title="Roles" description="A role is a set of things someone can do. Everyone has at least one; their menu adapts automatically."
        action={<Button icon="plus" onClick={() => setEditing(blank)}>New role</Button>} />
      <ErrorText>{roles.error}</ErrorText>
      {roles.loading && !roles.data ? <Loading /> : !roles.data?.length ? <Empty icon="shield" title="No roles" /> : (
        <ul className="rows">
          {roles.data.map((r) => (
            <li key={r.id} className="row-item">
              <span className="row-icon"><Icon name="shield" /></span>
              <span className="row-text">
                <strong>{r.name} {r.isSystem && <Pill>Built in</Pill>}</strong>
                <small>{r.description || 'No description'}</small>
              </span>
              <span className="row-meta">{r.userCount} {r.userCount === 1 ? 'person' : 'people'}</span>
              <span className="row-meta">{r.key === 'admin' ? 'Everything' : `${r.permissions.length} permissions`}</span>
              <span className="row-actions">
                <Button variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                {!r.isSystem && (
                  <button className="icon-btn danger" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Icon name="trash" size={18} /></button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && catalog.data && (
        <RoleEditor role={editing} catalog={catalog.data} onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); toast(msg); void roles.reload(); }} />
      )}
      {deleting && (
        <ConfirmDialog title={`Delete the ${deleting.name} role?`} confirmLabel="Delete role" danger onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/rbac/roles/${deleting.id}`, { method: 'DELETE' }); toast('Role deleted'); void roles.reload(); }}>
          <p>{deleting.userCount ? `${deleting.userCount} people still have this role — give them another role first.` : 'Nobody has this role, so nothing else changes.'}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function RoleEditor({ role, catalog, onClose, onDone }: { role: Role; catalog: Catalog; onClose: () => void; onDone: (msg: string) => void }) {
  const [r, setR] = useState(role);
  const isNew = !role.id;
  const isAdmin = role.key === 'admin';
  const [save, busy, error] = useAction(async () => {
    if (isNew) {
      const key = r.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'role';
      await api('/rbac/roles', { method: 'POST', json: { key: /^[a-z]/.test(key) ? key : `role-${key}`, name: r.name, description: r.description || undefined, permissions: r.permissions } });
      onDone(`${r.name} created`);
    } else {
      await api(`/rbac/roles/${r.id}`, { method: 'PATCH', json: { name: r.name, description: r.description, ...(isAdmin ? {} : { permissions: r.permissions }) } });
      onDone('Role saved');
    }
  });
  const toggle = (k: string) => setR({ ...r, permissions: r.permissions.includes(k) ? r.permissions.filter((x) => x !== k) : [...r.permissions, k] });

  return (
    <Modal title={isNew ? 'New role' : `Edit ${role.name}`} onClose={onClose} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={r.name.trim().length < 2} onClick={() => save()}>{isNew ? 'Create role' : 'Save role'}</Button></>}>
      <div className="form-row">
        <label className="field"><span>Name</span><input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Parent" /></label>
        <label className="field"><span>Description</span><input value={r.description ?? ''} onChange={(e) => setR({ ...r, description: e.target.value })} placeholder="Can see their child's sessions" /></label>
      </div>
      {isAdmin ? (
        <p className="muted">Administrators can always do everything, so there's nothing to choose here.</p>
      ) : (
        <div className="perm-groups">
          {Object.entries(catalog).map(([area, perms]) => (
            <fieldset key={area} className="checks">
              <legend>{area}</legend>
              {perms.map((p) => (
                <label key={p.key} className="check">
                  <input type="checkbox" checked={r.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
                  {p.description}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
