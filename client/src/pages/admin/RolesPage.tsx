/**
 * Dynamic RBAC editor: create custom user types and tick their permissions.
 * The permission list comes from the server catalog, so new features appear
 * here automatically once added to src/modules/rbac/permissions.ts.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Modal, PageHeader } from '../../components/ui';

interface Role { id: string; key: string; name: string; description: string | null; isSystem: boolean; permissions: string[]; userCount: number }
type Catalog = Record<string, { key: string; description: string }[]>;

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Catalog>({});
  const [editing, setEditing] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<Role[]>('/rbac/roles').then(setRoles);
  useEffect(() => {
    void load();
    void api<Catalog>('/rbac/permissions').then(setCatalog);
  }, []);

  const blank: Role = { id: '', key: '', name: '', description: '', isSystem: false, permissions: [], userCount: 0 };

  async function save(r: Role) {
    setError(null);
    try {
      if (r.id) await api(`/rbac/roles/${r.id}`, { method: 'PATCH', json: { name: r.name, description: r.description, ...(r.key === 'admin' ? {} : { permissions: r.permissions }) } });
      else await api('/rbac/roles', { method: 'POST', json: { key: r.key, name: r.name, description: r.description || undefined, permissions: r.permissions } });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function remove(r: Role) {
    if (!confirm(`Delete role "${r.name}"?`)) return;
    try {
      await api(`/rbac/roles/${r.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  return (
    <section>
      <PageHeader
        title="Roles & permissions"
        subtitle="Create custom user types and choose exactly what they can do."
        actions={<button onClick={() => setEditing(blank)}>New custom role</button>}
      />
      {error && <p className="error">{error}</p>}
      <table>
        <thead><tr><th>Role</th><th>Users</th><th>Permissions</th><th /></tr></thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong> {r.isSystem && <span className="badge muted">system</span>}<br /><small className="muted">{r.description}</small></td>
              <td>{r.userCount}</td>
              <td>{r.permissions.length}</td>
              <td className="row">
                <button className="secondary" onClick={() => setEditing({ ...r })}>Edit</button>
                {!r.isSystem && <button className="danger" onClick={() => remove(r)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.name}` : 'New role'} onClose={() => setEditing(null)} wide>
          <div className="row">
            {!editing.id && (
              <label>Key<input value={editing.key} placeholder="parent-observer" onChange={(e) => setEditing({ ...editing, key: e.target.value })} /></label>
            )}
            <label>Name<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
          </div>
          <label>Description<input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>

          {editing.key === 'admin' ? (
            <p className="muted">Administrators always have every permission.</p>
          ) : (
            Object.entries(catalog).map(([category, perms]) => (
              <fieldset key={category}>
                <legend>{category}</legend>
                {perms.map((p) => (
                  <label key={p.key} className="check">
                    <input
                      type="checkbox"
                      checked={editing.permissions.includes(p.key)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          permissions: e.target.checked ? [...editing.permissions, p.key] : editing.permissions.filter((k) => k !== p.key),
                        })
                      }
                    />
                    {p.description} <code>{p.key}</code>
                  </label>
                ))}
              </fieldset>
            ))
          )}
          <div className="row end">
            <button onClick={() => save(editing)}>Save</button>
            <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
