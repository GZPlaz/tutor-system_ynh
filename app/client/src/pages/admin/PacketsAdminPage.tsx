/**
 * Admin → Study packets: upload the free practice packets shown on the public
 * /packets page, edit their details, hide them, replace the file, or delete them.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Pill, useAction, useApi, useToast } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api, apiUrl } from '../../lib/api';
import { fileKind, fmtBytes } from '../../lib/files';
import type { PublicConfig, Service, StudyPacket } from '../../lib/types';

type Dialog = { kind: 'edit'; packet: StudyPacket | null } | { kind: 'delete'; packet: StudyPacket } | null;

export function PacketsAdminPage() {
  const toast = useToast();
  const packets = useApi<StudyPacket[]>('/packets');
  const [dialog, setDialog] = useState<Dialog>(null);

  const bySubject = useMemo(() => {
    const map = new Map<string, StudyPacket[]>();
    for (const p of packets.data ?? []) map.set(p.subject, [...(map.get(p.subject) ?? []), p]);
    return [...map.entries()];
  }, [packets.data]);

  async function togglePublished(p: StudyPacket) {
    try {
      await api(`/packets/${p.id}`, { method: 'PATCH', json: { isPublished: !p.isPublished } });
      toast(p.isPublished ? `${p.title} is now hidden` : `${p.title} is now on the packets page`);
      void packets.reload();
    } catch {
      toast('Could not change it. Please try again.');
    }
  }

  const add = () => setDialog({ kind: 'edit', packet: null });

  return (
    <div className="page">
      <PageHeader
        title="Study packets"
        description={<>Free practice packets anyone can download from the public <a href={`${import.meta.env.BASE_URL}packets`} target="_blank" rel="noopener">packets page</a>, no account needed.</>}
        action={<Button icon="upload" onClick={add}>Upload packet</Button>}
      />
      <ErrorText>{packets.error}</ErrorText>
      {packets.loading && !packets.data ? <Loading /> : !bySubject.length ? (
        <Empty icon="book" title="No packets yet" action={<Button icon="upload" onClick={add}>Upload your first packet</Button>}>
          Upload a PDF or Word document and choose its subject. It appears on the packets page straight away.
        </Empty>
      ) : (
        bySubject.map(([subject, items]) => (
          <section key={subject} className="section">
            <div className="section-head"><h2>{subject}</h2></div>
            <ul className="rows">
              {items.map((p) => (
                <li key={p.id} className={`row-item ${p.isPublished ? '' : 'is-muted'}`}>
                  <span className="row-icon"><Icon name="file" /></span>
                  <span className="row-text">
                    <strong>{p.title}</strong>
                    <small>
                      {fileKind(p.mimeType)}{p.pageCount ? `, ${p.pageCount} pages` : ''}, {fmtBytes(p.sizeBytes)} · {p.downloadCount} download{p.downloadCount === 1 ? '' : 's'}
                    </small>
                  </span>
                  <span className="row-meta">{p.isPublished ? <Pill tone="good">On the site</Pill> : <Pill>Hidden</Pill>}</span>
                  <span className="row-actions">
                    {p.isPublished && (
                      <a className="btn ghost" href={apiUrl(`/public/packets/${p.id}/download?view=1`)} target="_blank" rel="noopener">View</a>
                    )}
                    <Button variant="ghost" onClick={() => void togglePublished(p)}>{p.isPublished ? 'Hide' : 'Show'}</Button>
                    <Button variant="ghost" onClick={() => setDialog({ kind: 'edit', packet: p })}>Edit</Button>
                    <button className="icon-btn danger" aria-label={`Delete ${p.title}`} title="Delete packet" onClick={() => setDialog({ kind: 'delete', packet: p })}>
                      <Icon name="trash" size={18} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {dialog?.kind === 'edit' && (
        <PacketDialog
          packet={dialog.packet}
          subjects={bySubject.map(([s]) => s)}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); toast(msg); void packets.reload(); }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${dialog.packet.title}?`} confirmLabel="Delete packet" danger
          onConfirm={async () => { await api(`/packets/${dialog.packet.id}`, { method: 'DELETE' }); toast('Packet deleted'); void packets.reload(); }}
          onClose={() => setDialog(null)}>
          <p>It disappears from the packets page and the file is removed. To take it down for a while instead, use Hide.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function PacketDialog({ packet, subjects, onClose, onDone }: { packet: StudyPacket | null; subjects: string[]; onClose: () => void; onDone: (msg: string) => void }) {
  const config = useApi<PublicConfig>('/config');
  const services = useApi<Service[]>('/scheduling/services?all=true');
  const [fileName, setFileName] = useState('');
  const [published, setPublished] = useState(packet?.isPublished ?? true);

  // Suggest every subject already used plus every service name ("each subject we have").
  const suggestions = useMemo(
    () => [...new Set([...subjects, ...(services.data ?? []).map((s) => s.name)])].sort(),
    [subjects, services.data],
  );

  const [submit, busy, error] = useAction(async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const file = fd.get('file');
    const hasFile = file instanceof File && file.size > 0;
    if (!packet && !hasFile) throw new Error('Choose the packet file to upload.');
    if (hasFile && config.data && file.size > config.data.uploadMaxMb * 1024 * 1024) throw new Error(`Files must be smaller than ${config.data.uploadMaxMb} MB.`);
    if (!hasFile) fd.delete('file');
    fd.set('isPublished', String(published));
    if (packet) {
      // Empty optional fields clear them when editing.
      const json = !hasFile;
      if (json) {
        const v = (k: string) => String(fd.get(k) ?? '').trim();
        await api(`/packets/${packet.id}`, {
          method: 'PATCH',
          json: {
            title: v('title'),
            subject: v('subject'),
            description: v('description') || null,
            pageCount: v('pageCount') ? Number(v('pageCount')) : null,
            sortOrder: v('sortOrder') ? Number(v('sortOrder')) : 0,
            isPublished: published,
          },
        });
      } else {
        await api(`/packets/${packet.id}`, { method: 'PATCH', body: fd });
      }
      onDone('Packet saved');
    } else {
      await api('/packets', { method: 'POST', body: fd });
      onDone(published ? 'Packet uploaded and on the site' : 'Packet uploaded (hidden)');
    }
  });

  const formId = 'packet-form';
  return (
    <Modal title={packet ? `Edit ${packet.title}` : 'Upload a study packet'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button form={formId} busy={busy}>{packet ? 'Save changes' : 'Upload packet'}</Button></>}>
      <form id={formId} className="form" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); void submit(e.currentTarget); }}>
        <label className="dropzone">
          <Icon name="upload" size={24} />
          <span>{fileName || (packet ? `Replace ${packet.originalName} (optional)` : 'Choose a file')}</span>
          <small>PDF or Word{config.data ? `, up to ${config.data.uploadMaxMb} MB` : ''}</small>
          <input name="file" type="file" accept=".pdf,.doc,.docx,.odt,application/pdf" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />
        </label>
        <label className="field"><span>Title</span><input name="title" required maxLength={200} defaultValue={packet?.title} placeholder="ACT Math Practice Packet" /></label>
        <label className="field">
          <span>Subject</span>
          <input name="subject" required maxLength={80} list="packet-subjects" defaultValue={packet?.subject} placeholder="ACT Math" />
          <small className="hint">Packets are grouped under this heading. Pick one of your subjects or type a new one.</small>
          <datalist id="packet-subjects">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="field"><span>Description (optional)</span><textarea name="description" rows={3} maxLength={2000} defaultValue={packet?.description ?? ''} placeholder="What's inside and who it's for" /></label>
        <div className="form-row">
          <label className="field"><span>Pages (optional)</span><input name="pageCount" type="number" min={1} max={2000} defaultValue={packet?.pageCount ?? ''} /></label>
          <label className="field"><span>Order in subject</span><input name="sortOrder" type="number" min={-1000} max={1000} defaultValue={packet?.sortOrder ?? 0} /><small className="hint">Lower numbers are listed first.</small></label>
        </div>
        <label className="check"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Show on the public packets page</label>
        <ErrorText>{error}</ErrorText>
      </form>
    </Modal>
  );
}
