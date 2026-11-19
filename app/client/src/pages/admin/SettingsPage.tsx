/**
 * Site settings — the switches an administrator controls without touching the server:
 *   • sign-ups: open or invitation-only, approval, allowed email domains
 *   • booking: account needed or not, and the scheduling rules
 *   • maintenance mode
 * Everything saves together with "Save changes" and takes effect within seconds.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, ErrorText, Loading, PageHeader, useAction, useApi, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { loadConfig } from '../../lib/config';
import type { AppSettings } from '../../lib/types';

const parseDomains = (text: string) =>
  [...new Set(text.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];

function Switch({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch-row">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
}

function NumberField({ label, hint, value, onChange, min, max, step = 1 }: { label: string; hint: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      <small className="hint">{hint}</small>
    </label>
  );
}

export function SettingsPage() {
  const remote = useApi<AppSettings>('/settings');
  const toast = useToast();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [domainText, setDomainText] = useState('');

  const savedJson = useMemo(() => (remote.data ? JSON.stringify(remote.data) : ''), [remote.data]);
  useEffect(() => {
    if (remote.data) {
      setDraft(remote.data);
      setDomainText(remote.data.registration.allowedEmailDomains.join('\n'));
    }
  }, [savedJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(
    () => (draft ? { ...draft, registration: { ...draft.registration, allowedEmailDomains: parseDomains(domainText) } } : null),
    [draft, domainText],
  );
  const dirty = !!current && JSON.stringify(current) !== savedJson;
  const numbersOk = !!current && Object.values(current.booking).every((v) => typeof v !== 'number' || Number.isFinite(v));

  const [save, saving, saveError] = useAction(async () => {
    if (!current) return;
    await api('/settings', { method: 'PUT', json: current });
    remote.reload();
    void loadConfig(true);
    toast('Settings saved — they apply right away');
  });

  if (!current || !draft) {
    return (
      <div className="page">
        <PageHeader title="Settings" />
        {remote.error ? <ErrorText>{remote.error}</ErrorText> : <Loading />}
      </div>
    );
  }

  const setReg = (p: Partial<AppSettings['registration']>) => setDraft({ ...draft, registration: { ...draft.registration, ...p } });
  const setBook = (p: Partial<AppSettings['booking']>) => setDraft({ ...draft, booking: { ...draft.booking, ...p } });
  const setMaint = (p: Partial<AppSettings['maintenance']>) => setDraft({ ...draft, maintenance: { ...draft.maintenance, ...p } });

  return (
    <div className="page">
      <PageHeader title="Settings" description="Who can join, how people book, and a maintenance switch. Changes apply within seconds — no restart needed." />
      <div className="settings-form">
        <section className="panel">
          <h2 className="panel-title">New accounts</h2>
          <Switch
            checked={draft.registration.open}
            onChange={(open) => setReg({ open })}
            title="Let people create their own account"
            hint={draft.registration.open ? 'Anyone can sign up from the website.' : 'Off — accounts are by invitation only. Invite people from the People page.'}
          />
          <Switch
            checked={draft.registration.requireApproval}
            disabled={!draft.registration.open}
            onChange={(requireApproval) => setReg({ requireApproval })}
            title="New accounts must be approved by an administrator"
            hint={draft.registration.requireApproval ? 'People wait on a pending list until you approve them.' : 'Off — new accounts can sign in immediately.'}
          />
          <Switch
            checked={draft.registration.notifyAdmins}
            disabled={!draft.registration.open}
            onChange={(notifyAdmins) => setReg({ notifyAdmins })}
            title="Email administrators when someone signs up"
            hint="Goes to everyone who is allowed to approve users."
          />
          <div className="settings-grid">
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Only allow these email domains (optional)</span>
              <textarea rows={3} value={domainText} disabled={!draft.registration.open} onChange={(e) => setDomainText(e.target.value)} placeholder={'school.org\nstudents.school.org'} />
              <small className="hint">One per line. Leave empty to allow any email address. Subdomains must be listed separately.</small>
            </label>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Booking</h2>
          <Switch
            checked={draft.booking.requireAccount}
            onChange={(requireAccount) => setBook({ requireAccount })}
            title="An account is needed to book a session"
            hint={
              draft.booking.requireAccount
                ? 'Visitors must sign in or sign up before booking.'
                : 'Off — visitors can book with just a name and email.'
            }
          />
          <div className="settings-grid">
            <NumberField label="Earliest booking (hours ahead)" hint="Nobody can book a time sooner than this." value={draft.booking.minLeadHours} min={0} max={720} onChange={(minLeadHours) => setBook({ minLeadHours })} />
            <NumberField label="Furthest booking (days ahead)" hint="How far into the future times are offered." value={draft.booking.maxHorizonDays} min={1} max={365} onChange={(maxHorizonDays) => setBook({ maxHorizonDays })} />
            <NumberField label="Time slot spacing (minutes)" hint="Start times are offered every this many minutes." value={draft.booking.slotStepMinutes} min={5} max={120} step={5} onChange={(slotStepMinutes) => setBook({ slotStepMinutes })} />
            <NumberField label="Students can cancel until (hours before)" hint="After this, only staff can cancel." value={draft.booking.studentCancelCutoffHours} min={0} max={720} onChange={(studentCancelCutoffHours) => setBook({ studentCancelCutoffHours })} />
            <NumberField label="Remind tutor to add a Meet link (minutes before)" hint="Sent only if no link has been posted." value={draft.booking.meetingLinkNudgeMinutes} min={1} max={240} onChange={(meetingLinkNudgeMinutes) => setBook({ meetingLinkNudgeMinutes })} />
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Maintenance mode</h2>
          <Switch
            checked={draft.maintenance.enabled}
            onChange={(enabled) => setMaint({ enabled })}
            title="Lock everyone except administrators out"
            hint="Handy while you move data or update the site. Sign-ups and bookings are paused; you stay signed in."
          />
          <label className="field" style={{ marginTop: 10 }}>
            <span>Message shown to visitors</span>
            <input value={draft.maintenance.message} maxLength={300} onChange={(e) => setMaint({ message: e.target.value })} />
          </label>
        </section>

        <ErrorText>{saveError}</ErrorText>
        <div className="save-bar">
          <span className="muted">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
          <Button variant="secondary" disabled={!dirty || saving} onClick={() => remote.data && (setDraft(remote.data), setDomainText(remote.data.registration.allowedEmailDomains.join('\n')))}>Discard</Button>
          <Button busy={saving} disabled={!dirty || !numbersOk} onClick={() => save()}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
