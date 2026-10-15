/**
 * Resource Hub.
 *  - "Assigned to me": everything assigned directly or via a class (students).
 *  - "Library": resources I own (all, for resources:manage_any) — upload files,
 *    add links/videos, organise by folder/tags, assign to students or classes.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, Empty, ErrorText, Loading, Modal, PageHeader, Tabs, useAction, useApi, type Paged } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/time';
import { fullName, type Group, type PublicConfig, type Resource, type UserRow } from '../lib/types';

type View = 'assigned' | 'library';
const TYPE_ICON = { FILE: '📄', LINK: '🔗', VIDEO: '🎬' } as const;

export function ResourcesPage() {
  const { can } = useAuth();
  const canRead = can('resources:read_assigned');
  const canLibrary = can('resources:create') || can('resources:manage_any');
  const [view, setView] = useState<View>(canRead ? 'assigned' : 'library');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Resource | null>(null);

  const list = useApi<Resource[]>(`/resources?view=${view}${search ? `&search=${encodeURIComponent(search)}` : ''}`);

  const byFolder = useMemo(() => {
    const m = new Map<string, Resource[]>();
    for (const r of list.data ?? []) m.set(r.folder || 'Unfiled', [...(m.get(r.folder || 'Unfiled') ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => (a === 'Unfiled' ? 1 : b === 'Unfiled' ? -1 : a.localeCompare(b)));
  }, [list.data]);

  const [remove, , removeErr] = useAction(async (r: Resource) => {
    if (!confirm(`Delete "${r.title}"? Students will lose access.`)) return;
    await api(`/resources/${r.id}`, { method: 'DELETE' });
    await list.reload();
  });
  const [unassign, , unassignErr] = useAction(async (r: Resource, assignmentId: string) => {
    await api(`/resources/${r.id}/assignments/${assignmentId}`, { method: 'DELETE' });
    await list.reload();
  });
  const [download, , downloadErr] = useAction((r: Resource) => downloadFile(`/resources/${r.id}/download`, r.originalName ?? r.title));

  return (
    <section>
      <PageHeader title="Resources" actions={view === 'library' && can('resources:create') && <button onClick={() => setCreating(true)}>Add resource</button>} />
      {canRead && canLibrary && (
        <Tabs value={view} onChange={setView} options={[{ value: 'assigned', label: 'Assigned to me' }, { value: 'library', label: 'Library' }]} />
      )}
      <input className="search" type="search" placeholder="Search titles…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ErrorText>{list.error || removeErr || unassignErr || downloadErr}</ErrorText>

      {list.loading && !list.data ? (
        <Loading />
      ) : byFolder.length === 0 ? (
        <Empty>{view === 'assigned' ? 'Nothing has been assigned to you yet.' : 'Your library is empty — add a file or link.'}</Empty>
      ) : (
        byFolder.map(([folder, items]) => (
          <div key={folder}>
            <h2 className="folder">📁 {folder}</h2>
            <ul className="list">
              {items.map((r) => (
                <li key={r.id} className="card">
                  <div className="row between">
                    <div>
                      <strong>
                        {TYPE_ICON[r.type]} {r.title}
                      </strong>
                      {r.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                      {r.description && <p className="muted">{r.description}</p>}
                      <p className="muted small">
                        {fullName(r.owner)} · {fmtDate(r.createdAt)} {r.sizeBytes ? `· ${fmtBytes(r.sizeBytes)}` : ''}
                        {view === 'assigned' && r.assignments.find((a) => a.dueAt) && ` · due ${fmtDate(r.assignments.find((a) => a.dueAt)!.dueAt!)}`}
                      </p>
                    </div>
                    <div className="row">
                      {r.type === 'FILE' ? (
                        <button className="secondary" onClick={() => download(r)}>Download</button>
                      ) : (
                        <a className="button secondary" href={r.url ?? '#'} target="_blank" rel="noopener noreferrer">Open</a>
                      )}
                      {view === 'library' && (
                        <>
                          <button onClick={() => setAssigning(r)}>Assign</button>
                          <button className="link danger-text" onClick={() => remove(r)}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                  {view === 'library' && r.assignments.length > 0 && (
                    <div className="chips">
                      {r.assignments.map((a) => (
                        <span key={a.id} className="chip">
                          {a.group ? `👥 ${a.group.name}` : `👤 ${fullName(a.student)}`}
                          {a.dueAt && <span className="muted"> · due {fmtDate(a.dueAt)}</span>}
                          <button className="link" aria-label="Unassign" onClick={() => unassign(r, a.id)}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {creating && (
        <CreateResource
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void list.reload();
          }}
        />
      )}
      {assigning && (
        <AssignResource
          resource={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            void list.reload();
          }}
        />
      )}
    </section>
  );
}

function CreateResource({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const config = useApi<PublicConfig>('/config');
  const [type, setType] = useState<'FILE' | 'LINK' | 'VIDEO'>('FILE');
  const [submit, busy, error] = useAction(async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    fd.set('type', type);
    if (type === 'FILE') {
      fd.delete('url');
      const file = fd.get('file');
      if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload');
      if (config.data && file.size > config.data.uploadMaxMb * 1024 * 1024) throw new Error(`Files must be under ${config.data.uploadMaxMb} MB`);
    } else fd.delete('file');
    for (const [k, v] of [...fd.entries()]) if (v === '') fd.delete(k);
    await api('/resources', { method: 'POST', body: fd });
    onDone();
  });

  return (
    <Modal title="Add resource" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <Tabs value={type} onChange={setType} options={[{ value: 'FILE', label: 'Upload file' }, { value: 'LINK', label: 'Link' }, { value: 'VIDEO', label: 'Video' }]} />
        <label>Title<input name="title" required maxLength={200} /></label>
        {type === 'FILE' ? (
          <label>
            File {config.data && <span className="muted small">(max {config.data.uploadMaxMb} MB — PDF, Office, images, audio/video, text)</span>}
            <input name="file" type="file" required />
          </label>
        ) : (
          <label>URL<input name="url" type="url" placeholder="https://" pattern="https://.*" required /></label>
        )}
        <label>Description<textarea name="description" rows={3} maxLength={5000} /></label>
        <div className="row">
          <label className="grow">Folder<input name="folder" placeholder="e.g. Algebra/Unit 3" maxLength={200} /></label>
          <label className="grow">Tags<input name="tags" placeholder="comma, separated" /></label>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="row end">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AssignResource({ resource, onClose, onDone }: { resource: Resource; onClose: () => void; onDone: () => void }) {
  const { can } = useAuth();
  const students = useApi<Paged<UserRow>>('/users?role=student&status=ACTIVE&pageSize=100');
  const groups = useApi<Group[]>(can('groups:manage') ? '/groups' : null);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [filter, setFilter] = useState('');
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const [submit, busy, error] = useAction(async () => {
    await api(`/resources/${resource.id}/assign`, {
      method: 'POST',
      json: { studentIds, groupIds, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : undefined },
    });
    onDone();
  });

  const visibleStudents = (students.data?.items ?? []).filter((s) => `${fullName(s)} ${s.email}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal title={`Assign “${resource.title}”`} onClose={onClose} wide>
      {(groups.data?.length ?? 0) > 0 && (
        <fieldset>
          <legend>Classes</legend>
          {groups.data!.map((g) => (
            <label key={g.id} className="check">
              <input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => setGroupIds(toggle(groupIds, g.id))} />
              {g.name} <span className="muted">({g.members.length})</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Students</legend>
        <input type="search" placeholder="Filter students…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="scroll-list">
          {students.loading && <Loading />}
          {visibleStudents.map((s) => (
            <label key={s.id} className="check">
              <input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds(toggle(studentIds, s.id))} />
              {fullName(s)} <span className="muted small">{s.email}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>Due date (optional)<input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
      <ErrorText>{error || students.error}</ErrorText>
      <div className="row end">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy || studentIds.length + groupIds.length === 0} onClick={() => submit()}>
          Assign to {studentIds.length + groupIds.length || '…'}
        </button>
      </div>
    </Modal>
  );
}
