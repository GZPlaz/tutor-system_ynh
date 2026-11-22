/** Admin dialogs shared by the People list and a person's page. */
import { useState } from 'react';
import { api } from '../lib/api';
import { Button, ErrorText, Modal, useAction } from './ui';

export function EmailDialog({ recipients, onClose, onSent }: { recipients: { id: string; name: string }[]; onClose: () => void; onSent: (n: number) => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [send, busy, error] = useAction(async () => {
    const r = await api<{ sent: number }>('/users/email', { method: 'POST', json: { ids: recipients.map((p) => p.id), subject: subject.trim(), body: body.trim() } });
    onSent(r.sent);
  });
  const to = recipients.length === 1 ? recipients[0]!.name : `${recipients.length} people`;
  return (
    <Modal title={`Email ${to}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon="send" busy={busy} disabled={!subject.trim() || !body.trim()} onClick={() => void send()}>Send email</Button></>}>
      {recipients.length > 1 && <p className="muted small">{recipients.slice(0, 6).map((r) => r.name).join(', ')}{recipients.length > 6 ? ` and ${recipients.length - 6} more` : ''}. Each person gets their own copy.</p>}
      <label className="field"><span>Subject</span><input maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Schedule change next week" /></label>
      <label className="field">
        <span>Message</span>
        <textarea rows={8} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        <small className="hint">Sent from the site's email address with your name at the bottom, and recorded in the activity log.</small>
      </label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

export function SetPasswordDialog({ person, onClose, onDone }: { person: { id: string; firstName: string }; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [notify, setNotify] = useState(true);
  const [show, setShow] = useState(false);
  const [save, busy, error] = useAction(async () => {
    await api(`/users/${person.id}/set-password`, { method: 'POST', json: { password: pw, notify } });
    onDone();
  });
  const generate = () => {
    const words = 'maple river stone cloud lemon tiger piano rocket garden silver amber falcon'.split(' ');
    const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0]! % words.length];
    setPw(`${pick()}-${pick()}-${1000 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 9000)}`);
    setShow(true);
  };
  return (
    <Modal title={`Set a new password for ${person.firstName}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={pw.length < 10} onClick={() => void save()}>Set password</Button></>}>
      <p className="muted">Use this when {person.firstName} can't receive the reset email. They are signed out everywhere; tell them the new password in person or by phone, and ask them to change it.</p>
      <label className="field">
        <span>New password</span>
        <div className="copy-row">
          <input type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button type="button" variant="secondary" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</Button>
          <Button type="button" variant="secondary" onClick={generate}>Generate</Button>
        </div>
        <small className="hint">At least 10 characters, with a letter and a number.</small>
      </label>
      <label className="check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email {person.firstName} that their password was changed (the password itself is never emailed)</label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
