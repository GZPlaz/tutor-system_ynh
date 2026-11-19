/** Services — what students can book, how long it lasts, and who teaches it. */
import { useState } from 'react';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Pill, useAction, useApi, useToast, type Paged } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api, ApiError } from '../../lib/api';
import { fullName, type Service, type UserRow } from '../../lib/types';

type Dialog = { kind: 'edit'; service: Service | null } | { kind: 'tutors' | 'delete'; service: Service } | { kind: 'deleteBooked'; service: Service; upcoming: number } | null;

export function ServicesPage() {
  const toast = useToast();
  const services = useApi<Service[]>('/scheduling/services?all=true');
  const [dialog, setDialog] = useState<Dialog>(null);

  async function remove(service: Service, cancelUpcoming: boolean) {
    try {
      const r = await api<{ cancelled: number }>(`/scheduling/services/${service.id}?cancelUpcoming=${cancelUpcoming}`, { method: 'DELETE' });
      toast(`${service.name} deleted${r.cancelled ? `, ${r.cancelled} session${r.cancelled > 1 ? 's' : ''} cancelled` : ''}`);
      void services.reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SERVICE_HAS_BOOKINGS') {
        setDialog({ kind: 'deleteBooked', service, upcoming: (e.details as { upcoming: number }).upcoming });
        return;
      }
      throw e;
    }
  }

  return (
    <div className="page">
      <PageHeader title="Services" description="The subjects students can book, how long each session lasts, and which tutors teach it."
        action={<Button icon="plus" onClick={() => setDialog({ kind: 'edit', service: null })}>Add service</Button>} />
      <ErrorText>{services.error}</ErrorText>
      {services.loading && !services.data ? <Loading /> : !services.data?.length ? (
        <Empty icon="layers" title="No services yet" action={<Button icon="plus" onClick={() => setDialog({ kind: 'edit', service: null })}>Add your first service</Button>}>
          Create a service such as "SAT Math, 60 minutes", then choose who teaches it.
        </Empty>
      ) : (
        <ul className="rows">
          {services.data.map((s) => (
            <li key={s.id} className="row-item">
              <span className="row-icon"><Icon name="layers" /></span>
              <span className="row-text">
                <strong>{s.name}</strong>
                <small>{s.durationMinutes} minutes{s.bufferMinutes ? `, then ${s.bufferMinutes} min break` : ''}</small>
              </span>
              <span className="row-meta tutors-cell">
                {s.tutors.length ? (
                  <span className="avatar-stack" title={s.tutors.map((t) => fullName(t.tutor)).join(', ')}>
                    {s.tutors.slice(0, 4).map((t) => <Avatar key={t.tutor.id} name={fullName(t.tutor)} size={28} />)}
                    <span className="muted">{s.tutors.length} tutor{s.tutors.length > 1 ? 's' : ''}</span>
                  </span>
                ) : <Pill tone="attention">No tutors yet</Pill>}
              </span>
              <span className="row-meta">{s.isActive ? <Pill tone="good">Bookable</Pill> : <Pill>Hidden</Pill>}</span>
              <span className="row-actions">
                <Button variant="ghost" onClick={() => setDialog({ kind: 'tutors', service: s })}>Tutors</Button>
                <Button variant="ghost" onClick={() => setDialog({ kind: 'edit', service: s })}>Edit</Button>
                <button className="icon-btn danger" aria-label={`Delete ${s.name}`} title="Delete service" onClick={() => setDialog({ kind: 'delete', service: s })}>
                  <Icon name="trash" size={18} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'edit' && <ServiceDialog service={dialog.service} onClose={() => setDialog(null)} onDone={(msg) => { setDialog(null); toast(msg); void services.reload(); }} />}
      {dialog?.kind === 'tutors' && <TutorsDialog service={dialog.service} onClose={() => setDialog(null)} onDone={() => { setDialog(null); toast('Tutors updated'); void services.reload(); }} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${dialog.service.name}?`} confirmLabel="Delete service" danger onConfirm={() => remove(dialog.service, false)} onClose={() => setDialog((d) => (d?.kind === 'deleteBooked' ? d : null))}>
          <p>Students won't be able to book it any more. Past sessions keep their history. If you only want to stop new bookings for a while, edit it and untick "Students can book this" instead.</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'deleteBooked' && (
        <ConfirmDialog title={`${dialog.upcoming} upcoming session${dialog.upcoming > 1 ? 's use' : ' uses'} this service`} confirmLabel={`Cancel ${dialog.upcoming > 1 ? 'them' : 'it'} and delete`} danger
          reasonLabel={undefined} onConfirm={() => remove(dialog.service, true)} onClose={() => setDialog(null)}>
          <p>Deleting {dialog.service.name} now cancels {dialog.upcoming > 1 ? 'these sessions' : 'this session'} and emails the students and tutors. To avoid that, hide the service instead and delete it once those sessions are over.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ServiceDialog({ service, onClose, onDone }: { service: Service | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [form, setForm] = useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    durationMinutes: service?.durationMinutes ?? 60,
    bufferMinutes: service?.bufferMinutes ?? 10,
    isActive: service?.isActive ?? true,
  });
  const [submit, busy, error] = useAction(async () => {
    const body = {
      name: form.name,
      description: form.description || undefined,
      durationMinutes: Number(form.durationMinutes),
      bufferMinutes: Number(form.bufferMinutes),
      isActive: form.isActive,
    };
    if (service) await api(`/scheduling/services/${service.id}`, { method: 'PATCH', json: body });
    else await api('/scheduling/services', { method: 'POST', json: body });
    onDone(service ? 'Service saved' : 'Service added — now choose its tutors');
  });
  return (
    <Modal title={service ? `Edit ${service.name}` : 'Add a service'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => submit()}>{service ? 'Save changes' : 'Add service'}</Button></>}>
      <label className="field"><span>Name</span><input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SAT Math" /></label>
      <label className="field"><span>Short description (shown to students)</span><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Timed practice and test strategy" /></label>
      <div className="form-row">
        <label className="field"><span>Session length (minutes)</span><input type="number" min={15} max={480} step={5} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
        <label className="field"><span>Break after (minutes)</span><input type="number" min={0} max={120} step={5} value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} /><small className="hint">Keeps the tutor's next booking from starting straight away.</small></label>
      </div>
      <label className="check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Students can book this</label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function TutorsDialog({ service, onClose, onDone }: { service: Service; onClose: () => void; onDone: () => void }) {
  const tutors = useApi<Paged<UserRow>>('/users?role=tutor&status=ACTIVE&pageSize=100');
  const [selected, setSelected] = useState(service.tutors.map((t) => t.tutor.id));
  const [save, busy, error] = useAction(async () => {
    await api(`/scheduling/services/${service.id}/tutors`, { method: 'PUT', json: { tutorIds: selected } });
    onDone();
  });
  return (
    <Modal title={`Who teaches ${service.name}?`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => save()}>Save</Button></>}>
      {tutors.loading && <Loading />}
      {tutors.data?.items.length === 0 && <Empty icon="user" title="No tutors yet">Invite tutors from People first.</Empty>}
      <div className="check-list">
        {tutors.data?.items.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => setSelected((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))} />
            <Avatar name={fullName(t)} size={28} /> {fullName(t)} <span className="muted">{t.timezone}</span>
          </label>
        ))}
      </div>
      <ErrorText>{error || tutors.error}</ErrorText>
    </Modal>
  );
}
