/** Classes — groups of students, so you can share resources with everyone at once. */
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, useAction, useApi, useToast, type Paged } from '../components/ui';
import { api } from '../lib/api';
import { fullName, type Group, type UserRow } from '../lib/types';

export function ClassesPage() {
  const toast = useToast();
  const groups = useApi<Group[]>('/groups');
  const [editing, setEditing] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <PageHeader title="Classes" description="Group students together so you can share materials with the whole class in one go."
        action={<Button icon="plus" onClick={() => setCreating(true)}>New class</Button>} />
      <ErrorText>{groups.error}</ErrorText>
      {groups.loading && !groups.data ? <Loading /> : !groups.data?.length ? (
        <Empty icon="users" title="No classes yet" action={<Button icon="plus" onClick={() => setCreating(true)}>Create a class</Button>}>For example "SAT Prep, fall group".</Empty>
      ) : (
        <ul className="rows">
          {groups.data.map((g) => (
            <li key={g.id} className="row-item">
              <span className="row-icon"><Icon name="users" /></span>
              <span className="row-text">
                <strong>{g.name}</strong>
                <small>{g.members.length ? `${g.members.length} student${g.members.length > 1 ? 's' : ''}: ${g.members.slice(0, 4).map((m) => m.user.firstName).join(', ')}${g.members.length > 4 ? '…' : ''}` : 'No students yet'}</small>
              </span>
              <span className="row-actions">
                <Button variant="ghost" onClick={() => setEditing(g)}>Students</Button>
                <button className="icon-btn danger" aria-label={`Delete ${g.name}`} onClick={() => setDeleting(g)}><Icon name="trash" size={18} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateClass onClose={() => setCreating(false)} onDone={() => { setCreating(false); toast('Class created'); void groups.reload(); }} />}
      {editing && <Members group={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); toast('Students updated'); void groups.reload(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete class" danger onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/groups/${deleting.id}`, { method: 'DELETE' }); toast('Class deleted'); void groups.reload(); }}>
          <p>The students keep their accounts, but lose access to anything shared with this class.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function CreateClass({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [submit, busy, error] = useAction(async () => {
    await api('/groups', { method: 'POST', json: { name } });
    onDone();
  });
  return (
    <Modal title="New class" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={name.trim().length < 2} onClick={() => submit()}>Create class</Button></>}>
      <label className="field"><span>Class name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="SAT Prep, fall group" /></label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function Members({ group, onClose, onDone }: { group: Group; onClose: () => void; onDone: () => void }) {
  const students = useApi<Paged<UserRow>>('/users?role=student&status=ACTIVE&pageSize=100');
  const [selected, setSelected] = useState(group.members.map((m) => m.user.id));
  const [filter, setFilter] = useState('');
  const [save, busy, error] = useAction(async () => {
    await api(`/groups/${group.id}/members`, { method: 'PUT', json: { userIds: selected } });
    onDone();
  });
  const visible = (students.data?.items ?? []).filter((s) => `${fullName(s)} ${s.email}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Modal title={`Students in ${group.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => save()}>Save ({selected.length})</Button></>}>
      <label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="Find a student" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a student" /></label>
      <div className="check-list">
        {students.loading && <Loading />}
        {visible.map((s) => (
          <label key={s.id} className="check">
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => setSelected((sel) => (sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id]))} />
            <Avatar name={fullName(s)} size={28} /> {fullName(s)} <span className="muted">{s.email}</span>
          </label>
        ))}
      </div>
      <ErrorText>{error || students.error}</ErrorText>
    </Modal>
  );
}
