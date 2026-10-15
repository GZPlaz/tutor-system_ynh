/** Classes (groups of students) used to assign resources in bulk. */
import { useState } from 'react';
import { Empty, ErrorText, Loading, Modal, PageHeader, useAction, useApi, type Paged } from '../components/ui';
import { api } from '../lib/api';
import { fullName, type Group, type UserRow } from '../lib/types';

export function ClassesPage() {
  const groups = useApi<Group[]>('/groups');
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState('');

  const [create, creating, createErr] = useAction(async () => {
    await api('/groups', { method: 'POST', json: { name } });
    setName('');
    await groups.reload();
  });
  const [remove, , removeErr] = useAction(async (g: Group) => {
    if (!confirm(`Delete class "${g.name}"? Its resource assignments are removed too.`)) return;
    await api(`/groups/${g.id}`, { method: 'DELETE' });
    await groups.reload();
  });

  return (
    <section>
      <PageHeader title="Classes" subtitle="Group students so you can assign resources to everyone at once." />
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input placeholder="New class name, e.g. SAT Prep — Fall" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
        <button disabled={creating}>Create class</button>
      </form>
      <ErrorText>{groups.error || createErr || removeErr}</ErrorText>
      {groups.loading && !groups.data ? (
        <Loading />
      ) : !groups.data?.length ? (
        <Empty>No classes yet.</Empty>
      ) : (
        <ul className="list">
          {groups.data.map((g) => (
            <li key={g.id} className="card row between">
              <div>
                <strong>{g.name}</strong>
                <div className="muted small">{g.members.length ? g.members.map((m) => fullName(m.user)).join(', ') : 'No students yet'}</div>
              </div>
              <div className="row">
                <button className="secondary" onClick={() => setEditing(g)}>Members</button>
                <button className="link danger-text" onClick={() => remove(g)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <MembersDialog
          group={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void groups.reload();
          }}
        />
      )}
    </section>
  );
}

function MembersDialog({ group, onClose, onDone }: { group: Group; onClose: () => void; onDone: () => void }) {
  const students = useApi<Paged<UserRow>>('/users?role=student&status=ACTIVE&pageSize=100');
  const [selected, setSelected] = useState<string[]>(group.members.map((m) => m.user.id));
  const [filter, setFilter] = useState('');
  const [save, busy, error] = useAction(async () => {
    await api(`/groups/${group.id}/members`, { method: 'PUT', json: { userIds: selected } });
    onDone();
  });
  const visible = (students.data?.items ?? []).filter((s) => `${fullName(s)} ${s.email}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal title={`${group.name} — members`} onClose={onClose}>
      <input type="search" placeholder="Filter students…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="scroll-list">
        {students.loading && <Loading />}
        {visible.map((s) => (
          <label key={s.id} className="check">
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={() => setSelected((sel) => (sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id]))}
            />
            {fullName(s)} <span className="muted small">{s.email}</span>
          </label>
        ))}
      </div>
      <ErrorText>{error || students.error}</ErrorText>
      <div className="row end">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={() => save()}>Save ({selected.length})</button>
      </div>
    </Modal>
  );
}
