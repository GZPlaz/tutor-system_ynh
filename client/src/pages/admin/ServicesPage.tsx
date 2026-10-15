/** Bookable services (name, length, buffer, price) and which tutors deliver them. */
import { useState } from 'react';
import { Badge, Empty, ErrorText, Loading, Modal, PageHeader, useAction, useApi, type Paged } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtMoney } from '../../lib/time';
import { fullName, type Service, type UserRow } from '../../lib/types';

export function ServicesPage() {
  const services = useApi<Service[]>('/scheduling/services?all=true');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [tutorsFor, setTutorsFor] = useState<Service | null>(null);

  return (
    <section>
      <PageHeader title="Services" subtitle="What students can book, and who teaches it." actions={<button onClick={() => setEditing('new')}>New service</button>} />
      <ErrorText>{services.error}</ErrorText>
      {services.loading && !services.data ? (
        <Loading />
      ) : !services.data?.length ? (
        <Empty>No services yet — create one, then assign tutors to it.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Service</th><th>Length</th><th>Buffer</th><th>Price</th><th>Tutors</th><th>Status</th><th /></tr></thead>
            <tbody>
              {services.data.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong>{s.description && <div className="muted small">{s.description}</div>}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{s.bufferMinutes} min</td>
                  <td>{fmtMoney(s.priceCents, s.currency)}</td>
                  <td>{s.tutors.length ? s.tutors.map((t) => fullName(t.tutor)).join(', ') : <span className="error">none</span>}</td>
                  <td>{s.isActive ? <Badge tone="good">active</Badge> : <Badge>hidden</Badge>}</td>
                  <td className="row end">
                    <button className="secondary" onClick={() => setTutorsFor(s)}>Tutors</button>
                    <button className="secondary" onClick={() => setEditing(s)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ServiceDialog service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); void services.reload(); }} />}
      {tutorsFor && <TutorsDialog service={tutorsFor} onClose={() => setTutorsFor(null)} onDone={() => { setTutorsFor(null); void services.reload(); }} />}
    </section>
  );
}

function ServiceDialog({ service, onClose, onDone }: { service: Service | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    durationMinutes: service?.durationMinutes ?? 60,
    bufferMinutes: service?.bufferMinutes ?? 10,
    price: service?.priceCents != null ? (service.priceCents / 100).toFixed(2) : '',
    currency: service?.currency ?? 'USD',
    isActive: service?.isActive ?? true,
  });
  const [submit, busy, error] = useAction(async () => {
    const body = {
      name: form.name,
      description: form.description || undefined,
      durationMinutes: Number(form.durationMinutes),
      bufferMinutes: Number(form.bufferMinutes),
      priceCents: form.price === '' ? null : Math.round(Number(form.price) * 100),
      currency: form.currency,
      isActive: form.isActive,
    };
    if (service) await api(`/scheduling/services/${service.id}`, { method: 'PATCH', json: body });
    else await api('/scheduling/services', { method: 'POST', json: body });
    onDone();
  });
  return (
    <Modal title={service ? `Edit ${service.name}` : 'New service'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label>Name<input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SAT Math — 60 min" /></label>
        <label>Description<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <div className="row">
          <label className="grow">Length (min)<input type="number" min={15} max={480} step={5} required value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
          <label className="grow">Buffer after (min)<input type="number" min={0} max={120} step={5} value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} /></label>
        </div>
        <div className="row">
          <label className="grow">Price (informational)<input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="optional" /></label>
          <label>Currency<input value={form.currency} maxLength={3} size={4} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Bookable by students</label>
        <ErrorText>{error}</ErrorText>
        <div className="row end">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
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
    <Modal title={`Tutors for ${service.name}`} onClose={onClose}>
      {tutors.loading && <Loading />}
      {tutors.data?.items.length === 0 && <Empty>No active tutors yet. Invite one from Users.</Empty>}
      <div className="scroll-list">
        {tutors.data?.items.map((t) => (
          <label key={t.id} className="check">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => setSelected((s) => (s.includes(t.id) ? s.filter((x) => x !== t.id) : [...s, t.id]))} />
            {fullName(t)} <span className="muted small">{t.timezone}</span>
          </label>
        ))}
      </div>
      <ErrorText>{error || tutors.error}</ErrorText>
      <div className="row end">
        <button className="secondary" onClick={onClose}>Cancel</button>
        <button disabled={busy} onClick={() => save()}>Save</button>
      </div>
    </Modal>
  );
}
