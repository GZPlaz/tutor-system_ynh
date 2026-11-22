/** Your profile: name and time zone (used for every time and email), notifications, password, devices, tour. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Section } from '../components/Shell';
import { Button, ConfirmDialog, ErrorText, PageHeader, useAction, useToast } from '../components/ui';
import { api, downloadFile, setAccessToken } from '../lib/api';
import { fmtDate } from '../lib/time';
import { allTimeZones, browserTimeZone } from '../lib/time';

export function ProfilePage() {
  const { user, reload, can } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', timezone: user?.timezone ?? 'UTC' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const browserTz = browserTimeZone();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(user?.preferences ?? { emailOnMessage: true, emailReminders: true });

  const [savePref] = useAction(async (key: 'emailOnMessage' | 'emailReminders', value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      await api('/auth/me', { method: 'PATCH', json: { [key]: value } });
      await reload();
      toast(value ? 'Emails turned on' : 'Emails turned off');
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      throw e;
    }
  });
  const [sendReset, sendingReset, resetErr] = useAction(async () => {
    const r = await api<{ message: string }>('/auth/me/password-reset-email', { method: 'POST' });
    toast(r.message);
  });
  const [restartTour, restarting] = useAction(async () => {
    await api('/auth/me/tour', { method: 'POST', json: { done: false } });
    await reload();
    navigate('/');
  });

  const [saveProfile, saving, profileErr] = useAction(async () => {
    await api('/auth/me', { method: 'PATCH', json: form });
    await reload();
    toast('Profile saved');
  });
  const [changePassword, changing, pwErr] = useAction(async () => {
    if (pw.newPassword !== pw.confirm) throw new Error("The two new passwords don't match.");
    await api('/auth/me/password', { method: 'POST', json: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
    setAccessToken(null);
    window.location.href = `${import.meta.env.BASE_URL}login`;
  });
  const [logoutAll, loggingOut] = useAction(async () => {
    await api('/auth/logout-all', { method: 'POST' });
    setAccessToken(null);
    window.location.href = `${import.meta.env.BASE_URL}login`;
  });

  return (
    <div className="page narrow">
      <PageHeader title="Your profile" description={user?.email} />

      <Section title="Details">
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
          <div className="form-row">
            <label className="field"><span>First name</span><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
            <label className="field"><span>Last name</span><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          </div>
          <label className="field">
            <span>Time zone</span>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>{allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}</select>
            <small className="hint">
              Every session time and email uses this.
              {form.timezone !== browserTz && <> This device is set to {browserTz}. <button type="button" className="link-btn" onClick={() => setForm({ ...form, timezone: browserTz })}>Use that</button></>}
            </small>
          </label>
          <ErrorText>{profileErr}</ErrorText>
          <div className="button-row"><Button busy={saving}>Save details</Button></div>
        </form>
      </Section>

      <Section title="Email notifications">
        <div className="panel">
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={prefs.emailOnMessage} onChange={(e) => void savePref('emailOnMessage', e.target.checked)} />
            <span><strong>New messages and questions</strong><small>One email when someone messages you, then none until you've read it.</small></span>
          </label>
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={prefs.emailReminders} onChange={(e) => void savePref('emailReminders', e.target.checked)} />
            <span><strong>Session reminders</strong><small>A day before and an hour before each confirmed session.</small></span>
          </label>
          <p className="hint" style={{ marginTop: 8 }}>Booking confirmations, cancellations, Meet links and account emails are always sent.</p>
        </div>
      </Section>

      {can('sessions:view_feed') && <CalendarSync />}

      <Section title="Password">
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
          <label className="field"><span>Current password</span><input type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></label>
          <div className="form-row">
            <label className="field"><span>New password</span><input type="password" autoComplete="new-password" minLength={10} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></label>
            <label className="field"><span>Type it again</span><input type="password" autoComplete="new-password" minLength={10} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          </div>
          <small className="hint">At least 10 characters, with a letter and a number. You'll be signed out everywhere afterwards.</small>
          <ErrorText>{pwErr || resetErr}</ErrorText>
          <div className="button-row">
            <Button busy={changing}>Change password</Button>
            <span className="spacer" />
            <button type="button" className="link-btn" disabled={sendingReset} onClick={() => void sendReset()}>Forgot your current password? Email me a reset link</button>
          </div>
        </form>
      </Section>

      <Section title="Devices">
        <div className="panel row-between">
          <p className="muted">Lost a phone or used a shared computer? Sign out of every device at once.</p>
          <Button variant="secondary" busy={loggingOut} onClick={() => logoutAll()}>Sign out everywhere</Button>
        </div>
      </Section>

      <YourData />

      <Section title="Getting around">
        <div className="panel row-between">
          <p className="muted">See the short tour of where everything is again.</p>
          <Button variant="secondary" busy={restarting} onClick={() => void restartTour()}>Take the tour again</Button>
        </div>
      </Section>
    </div>
  );
}

/** Privacy rights: a copy of everything we hold, and asking for the account to be deleted. */
function YourData() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const requested = user?.legal.deletionRequestedAt ?? null;
  const [download, downloading, downloadErr] = useAction(async () => {
    await downloadFile('/legal/export', `my-data-${new Date().toISOString().slice(0, 10)}.json`);
  });
  const [cancelRequest, cancelling, cancelErr] = useAction(async () => {
    await api('/legal/deletion-request', { method: 'DELETE' });
    await reload();
    toast('Deletion request withdrawn');
  });
  return (
    <Section title="Your data">
      <div className="data-rights">
      <div className="panel row-between">
        <p className="muted">
          Download a copy of your profile, bookings, messages and other information we hold about you.{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener">Privacy Policy</a>
        </p>
        <Button variant="secondary" busy={downloading} onClick={() => void download()}>Download my data</Button>
      </div>
      <ErrorText>{downloadErr}</ErrorText>
      <div className="panel row-between">
        {requested ? (
          <>
            <p><strong>Deletion requested</strong> on {fmtDate(requested, user?.timezone ?? 'UTC')}. An administrator will process it, normally within 30 days.</p>
            <Button variant="secondary" busy={cancelling} onClick={() => void cancelRequest()}>Withdraw request</Button>
          </>
        ) : (
          <>
            <p className="muted">Ask us to delete your account and personal information. An administrator processes it and confirms by email.</p>
            <Button variant="danger" onClick={() => setAsking(true)}>Request account deletion</Button>
          </>
        )}
      </div>
      </div>
      <ErrorText>{cancelErr}</ErrorText>
      {asking && (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Send deletion request"
          danger
          reasonLabel="Anything you'd like to tell us? (optional)"
          onClose={() => setAsking(false)}
          onConfirm={async (reason) => {
            await api('/legal/deletion-request', { method: 'POST', json: { reason } });
            await reload();
            toast('Request sent. We have emailed you a confirmation.');
          }}
        >
          <p>
            Your name, email and other personal details will be removed and you will no longer be able to sign in. Upcoming
            sessions will be cancelled. A minimal record of past sessions may be kept where the law requires.
          </p>
          <p className="muted">Consider downloading your data first. You can withdraw the request until it is processed.</p>
        </ConfirmDialog>
      )}
    </Section>
  );
}

/** Personal calendar feed: subscribe once and sessions appear in Google/Apple/Outlook calendars. */
function CalendarSync() {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [show, showing, showErr] = useAction(async () => {
    setUrl((await api<{ url: string }>('/sessions/calendar-feed')).url);
  });
  const [reset, resetting, resetErr] = useAction(async () => {
    setUrl((await api<{ url: string }>('/sessions/calendar-feed/reset', { method: 'POST' })).url);
    toast('New link created. The old one no longer works.');
  });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('Select the link and copy it');
    }
  };
  return (
    <Section title="Calendar sync">
      <div className="panel form">
        <p className="muted">Subscribe once, and your sessions appear in Google Calendar, Apple Calendar or Outlook and stay up to date, including new bookings, changes and cancellations.</p>
        {!url ? (
          <div className="button-row"><Button variant="secondary" icon="calendarSync" busy={showing} onClick={() => void show()}>Show my calendar link</Button></div>
        ) : (
          <>
            <label className="field">
              <span>Your private calendar link</span>
              <div className="copy-row">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar link" />
                <Button variant="secondary" icon="copy" onClick={() => void copy()}>Copy</Button>
              </div>
              <small className="hint">Anyone with this link can see your session times and who they're with. Don't share it.</small>
            </label>
            <details className="howto">
              <summary>How to add it</summary>
              <ul>
                <li><strong>Google Calendar:</strong> on a computer, Other calendars → + → From URL → paste the link.</li>
                <li><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste the link. On iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.</li>
                <li><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link.</li>
              </ul>
              <p className="hint">Calendar apps check for changes every few hours, so new bookings can take a little while to appear.</p>
            </details>
            <div className="button-row"><button className="link-btn" disabled={resetting} onClick={() => void reset()}>Shared it by mistake? Create a new link</button></div>
          </>
        )}
        <ErrorText>{showErr || resetErr}</ErrorText>
      </div>
    </Section>
  );
}
