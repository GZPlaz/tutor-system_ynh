/** Profile: name + timezone (drives how every time is shown/emailed), password, sessions. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorText, PageHeader, useAction } from '../components/ui';
import { api, setAccessToken } from '../lib/api';
import { allTimeZones, browserTimeZone } from '../lib/time';

export function ProfilePage() {
  const { user, reload } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', timezone: user?.timezone ?? 'UTC' });
  const [savedMsg, setSavedMsg] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const [saveProfile, saving, profileErr] = useAction(async () => {
    await api('/auth/me', { method: 'PATCH', json: form });
    await reload();
    setSavedMsg('Saved ✓');
    setTimeout(() => setSavedMsg(''), 2500);
  });

  const [changePassword, changing, pwErr, setPwErr] = useAction(async () => {
    if (pw.newPassword !== pw.confirm) {
      setPwErr('The new passwords do not match');
      return;
    }
    await api('/auth/me/password', { method: 'POST', json: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } });
    setAccessToken(null);
    navigate('/login', { replace: true });
    window.location.reload();
  });

  const [logoutAll, loggingOut] = useAction(async () => {
    await api('/auth/logout-all', { method: 'POST' });
    setAccessToken(null);
    window.location.href = `${import.meta.env.BASE_URL}login`;
  });

  const browserTz = browserTimeZone();

  return (
    <section>
      <PageHeader title="Your profile" subtitle={user?.email} />

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}>
        <h2>Details</h2>
        <div className="row">
          <label className="grow">First name<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label className="grow">Last name<input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
        </div>
        <label>
          Timezone — all session times and emails use this
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {allTimeZones().map((tz) => <option key={tz}>{tz}</option>)}
          </select>
        </label>
        {form.timezone !== browserTz && (
          <p className="muted small">
            Your device is set to {browserTz}. <button type="button" className="link" onClick={() => setForm({ ...form, timezone: browserTz })}>Use it</button>
          </p>
        )}
        <ErrorText>{profileErr}</ErrorText>
        <div className="row end">
          <span className="muted">{savedMsg}</span>
          <button disabled={saving}>Save</button>
        </div>
      </form>

      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void changePassword(); }}>
        <h2>Password</h2>
        <label>Current password<input type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></label>
        <div className="row">
          <label className="grow">New password<input type="password" autoComplete="new-password" minLength={10} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></label>
          <label className="grow">Confirm<input type="password" autoComplete="new-password" minLength={10} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
        </div>
        <p className="muted small">At least 10 characters with a letter and a number. You'll be signed out everywhere.</p>
        <ErrorText>{pwErr}</ErrorText>
        <div className="row end"><button disabled={changing}>Change password</button></div>
      </form>

      <div className="card row between">
        <div>
          <h2>Sessions</h2>
          <p className="muted">Lost a device? Sign out of MindAccel on every browser.</p>
        </div>
        <button className="secondary" disabled={loggingOut} onClick={() => logoutAll()}>Sign out everywhere</button>
      </div>
    </section>
  );
}
