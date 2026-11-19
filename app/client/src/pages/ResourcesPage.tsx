/**
 * Resources — worksheets, files, links and videos.
 *  - "Shared with me": everything assigned to me directly or through a class.
 *  - "My library" (tutors): add files/links, organise in folders, share.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Section } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Segmented, useAction, useApi, useToast, type Paged } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/time';
import { fullName, type Group, type PublicConfig, type Resource, type UserRow } from '../lib/types';

type View = 'assigned' | 'library';
const TYPE_ICON = { FILE: 'file', LINK: 'link', VIDEO: 'video' } as const;

export function ResourcesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canRead = can('resources:read_assigned');
  const canLibrary = can('resources:create') || can('resources:manage_any');
  const [view, setView] = useState<View>(canLibrary ? 'library' : 'assigned');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const list = useApi<Resource[]>(`/resources?view=${view}${search ? `&search=${encodeURIComponent(search)}` : ''}`);

  const folders = useMemo(() => {
    const m = new Map<string, Resource[]>();
    for (const r of list.data ?? []) m.set(r.folder || 'Other', [...(m.get(r.folder || 'Other') ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)));
  }, [list.data]);

  const [open, , openError] = useAction(async (r: Resource) => {
    if (r.type === 'FILE') await downloadFile(`/resources/${r.id}/download`, r.originalName ?? r.title);
    else window.open(r.url ?? '#', '_blank', 'noopener,noreferrer');
  });
  const [unshare, , unshareError] = useAction(async (r: Resource, assignmentId: string) => {
    await api(`/resources/${r.id}/assignments/${assignmentId}`, { method: 'DELETE' });
    toast('No longer shared');
    await list.reload();
  });

  return (
    <div className="page">
      <PageHeader
        title="Resources"
        description={view === 'assigned' ? 'Worksheets, files and links your tutors have shared with you.' : 'Your files and links. Share them with students or whole classes.'}
        action={view === 'library' && can('resources:create') && <Button icon="plus" onClick={() => setAdding(true)}>Add resource</Button>}
      />
      <div className="toolbar">
        {canRead && canLibrary && (
          <Segmented label="Resources" value={view} onChange={setView} options={[{ value: 'library', label: 'My library' }, { value: 'assigned', label: 'Shared with me' }]} />
        )}
        <label className="search-field">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search titles" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resources" />
        </label>
      </div>
      <ErrorText>{list.error || openError || unshareError}</ErrorText>

      {list.loading && !list.data ? <Loading /> : !folders.length ? (
        search ? <Empty icon="search" title="Nothing matches that search" /> :
        view === 'assigned' ? <Empty icon="book" title="Nothing shared yet">When your tutor shares a worksheet or link, it appears here.</Empty> :
        <Empty icon="upload" title="Your library is empty" action={can('resources:create') && <Button icon="plus" onClick={() => setAdding(true)}>Add your first resource</Button>}>Upload worksheets and notes, or save links and videos to share with students.</Empty>
      ) : (
        folders.map(([folder, items]) => (
          <Section key={folder} title={folder}>
            <ul className="rows">
              {items.map((r) => {
                const due = r.assignments.find((a) => a.dueAt)?.dueAt;
                return (
                  <li key={r.id} className="row-item resource">
                    <span className="row-icon"><Icon name={TYPE_ICON[r.type]} /></span>
                    <span className="row-text">
                      <button className="title-btn" onClick={() => open(r)}>{r.title}</button>
                      <small>
                        {r.description ? `${r.description} ` : ''}
                        {view === 'assigned' ? `From ${fullName(r.owner)}` : `Added ${fmtDate(r.createdAt)}`}
                        {r.sizeBytes ? `, ${fmtBytes(r.sizeBytes)}` : ''}
                        {view === 'assigned' && due ? `. Due ${fmtDate(due)}` : ''}
                      </small>
                      {view === 'library' && r.assignments.length > 0 && (
                        <span className="chips">
                          {r.assignments.map((a) => (
                            <span key={a.id} className="chip">
                              {a.group ? a.group.name : fullName(a.student)}
                              <button className="chip-x" aria-label={`Stop sharing with ${a.group?.name ?? fullName(a.student)}`} onClick={() => unshare(r, a.id)}><Icon name="x" size={14} /></button>
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <span className="row-actions">
                      <Button variant="secondary" icon={r.type === 'FILE' ? 'download' : 'external'} onClick={() => open(r)}>{r.type === 'FILE' ? 'Download' : 'Open'}</Button>
                      {view === 'library' && (
                        <>
                          <Button variant="ghost" onClick={() => setSharing(r)}>Share</Button>
                          <button className="icon-btn danger" aria-label={`Delete ${r.title}`} onClick={() => setDeleting(r)}><Icon name="trash" size={18} /></button>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))
      )}

      {adding && <AddResource onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('Added to your library'); void list.reload(); }} />}
      {sharing && <ShareResource resource={sharing} onClose={() => setSharing(null)} onDone={(n) => { setSharing(null); toast(`Shared with ${n}`); void list.reload(); }} />}
      {deleting && (
        <ConfirmDialog title={`Delete "${deleting.title}"?`} confirmLabel="Delete" danger onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/resources/${deleting.id}`, { method: 'DELETE' }); toast('Deleted'); void list.reload(); }}>
          <p>Students it was shared with will lose access.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function AddResource({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const config = useApi<PublicConfig>('/config');
  const [type, setType] = useState<'FILE' | 'LINK' | 'VIDEO'>('FILE');
  const [fileName, setFileName] = useState('');
  const [submit, busy, error] = useAction(async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    fd.set('type', type);
    if (type === 'FILE') {
      fd.delete('url');
      const file = fd.get('file');
      if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload.');
      if (config.data && file.size > config.data.uploadMaxMb * 1024 * 1024) throw new Error(`Files must be smaller than ${config.data.uploadMaxMb} MB.`);
    } else fd.delete('file');
    for (const [k, v] of [...fd.entries()]) if (v === '') fd.delete(k);
    await api('/resources', { method: 'POST', body: fd });
    onDone();
  });
  const formId = 'add-resource';
  return (
    <Modal title="Add a resource" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form={formId} busy={busy}>Add to library</Button></>}>
      <form id={formId} className="form" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void submit(e.currentTarget); }}>
        <Segmented label="Type" value={type} onChange={setType} options={[{ value: 'FILE', label: 'File' }, { value: 'LINK', label: 'Link' }, { value: 'VIDEO', label: 'Video' }]} />
        {type === 'FILE' ? (
          <label className="dropzone">
            <Icon name="upload" size={24} />
            <span>{fileName || 'Choose a file'}</span>
            <small>PDF, Word, PowerPoint, Excel, images, audio or video{config.data ? `, up to ${config.data.uploadMaxMb} MB` : ''}</small>
            <input name="file" type="file" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
          </label>
        ) : (
          <label className="field"><span>{type === 'VIDEO' ? 'Video link' : 'Link'}</span><input name="url" type="url" placeholder="https://" required /></label>
        )}
        <label className="field"><span>Title</span><input name="title" required maxLength={200} placeholder="Quadratics worksheet A" /></label>
        <label className="field"><span>Description (optional)</span><textarea name="description" rows={2} maxLength={5000} /></label>
        <div className="form-row">
          <label className="field"><span>Folder (optional)</span><input name="folder" maxLength={200} placeholder="Algebra" /></label>
          <label className="field"><span>Tags (optional)</span><input name="tags" placeholder="homework, unit 3" /></label>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}

function ShareResource({ resource, onClose, onDone }: { resource: Resource; onClose: () => void; onDone: (summary: string) => void }) {
  const { can } = useAuth();
  const students = useApi<Paged<UserRow>>('/users?role=student&status=ACTIVE&pageSize=100');
  const groups = useApi<Group[]>(can('groups:manage') ? '/groups' : null);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [filter, setFilter] = useState('');
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const total = studentIds.length + groupIds.length;
  const [submit, busy, error] = useAction(async () => {
    await api(`/resources/${resource.id}/assign`, { method: 'POST', json: { studentIds, groupIds, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : undefined } });
    onDone(total === 1 ? '1 recipient' : `${total} recipients`);
  });
  const visible = (students.data?.items ?? []).filter((s) => `${fullName(s)} ${s.email}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Modal title={`Share "${resource.title}"`} onClose={onClose} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!total} onClick={() => submit()}>{total ? `Share with ${total}` : 'Share'}</Button></>}>
      {(groups.data?.length ?? 0) > 0 && (
        <fieldset className="checks">
          <legend>Classes</legend>
          {groups.data!.map((g) => (
            <label key={g.id} className="check"><input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => setGroupIds(toggle(groupIds, g.id))} /> {g.name} <span className="muted">({g.members.length} students)</span></label>
          ))}
        </fieldset>
      )}
      <fieldset className="checks">
        <legend>Students</legend>
        <label className="search-field"><Icon name="search" size={18} /><input type="search" placeholder="Find a student" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a student" /></label>
        <div className="check-list">
          {students.loading && <Loading />}
          {visible.map((s) => (
            <label key={s.id} className="check"><input type="checkbox" checked={studentIds.includes(s.id)} onChange={() => setStudentIds(toggle(studentIds, s.id))} /> {fullName(s)} <span className="muted">{s.email}</span></label>
          ))}
        </div>
      </fieldset>
      <label className="field narrow-field"><span>Due date (optional)</span><input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
      <ErrorText>{error || students.error}</ErrorText>
    </Modal>
  );
}
