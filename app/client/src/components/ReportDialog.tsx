/**
 * "Report a problem" with a tutor. Goes to the site's administrators only; the tutor is not
 * told who reported them. Used from session cards and message threads.
 */
import { useState } from 'react';
import { api } from '../lib/api';
import { Button, ErrorText, Modal, useAction } from './ui';

const CATEGORIES = [
  { value: 'SAFETY', label: 'Safety or safeguarding concern', hint: 'Anything that made you feel unsafe, or worries you about a young person.' },
  { value: 'CONDUCT', label: 'Inappropriate behaviour or language' },
  { value: 'NO_SHOW', label: "Didn't show up or was very late" },
  { value: 'QUALITY', label: 'Poor quality of teaching' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export function ReportDialog({ tutor, bookingId, onClose, onDone }: { tutor: { id: string; name: string }; bookingId?: string; onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value'] | ''>('');
  const [details, setDetails] = useState('');
  const [send, busy, error] = useAction(async () => {
    if (!category) throw new Error('Choose what the problem is about.');
    await api('/reports', { method: 'POST', json: { tutorId: tutor.id, bookingId, category, details: details.trim() } });
    onDone();
  });
  return (
    <Modal title={`Report a problem with ${tutor.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} disabled={!category || details.trim().length < 10} onClick={() => void send()}>Send report</Button></>}>
      <p className="muted">Your report goes to the site's administrators, not to {tutor.name.split(' ')[0]}. They will look into it and may contact you. If someone is in immediate danger, contact the emergency services first.</p>
      <fieldset className="checks">
        <legend>What is it about?</legend>
        {CATEGORIES.map((c) => (
          <label key={c.value} className="check radio-card">
            <input type="radio" name="report-category" checked={category === c.value} onChange={() => setCategory(c.value)} />
            <span><strong>{c.label}</strong>{'hint' in c && <small>{c.hint}</small>}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>What happened?</span>
        <textarea rows={5} maxLength={4000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Describe what happened, when, and anything else that would help." />
        <small className="hint">At least a sentence. Please don't include passwords or payment details.</small>
      </label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
