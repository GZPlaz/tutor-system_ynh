/**
 * Shown over the app when the signed-in person hasn't accepted the current Terms and
 * Privacy Policy: accounts created before the legal pages existed, or after an admin
 * publishes updated terms (Settings → Legal). It can't be dismissed, only accepted,
 * or the person can sign out.
 */
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { ConsentControls, NO_CONSENT, consentBody, consentComplete, useLegal, type Consent } from '../lib/legal';
import { Button, ErrorText, Modal, useAction } from './ui';

const stay = () => undefined;

export function TermsGate() {
  const { user, reload, logout } = useAuth();
  const legal = useLegal();
  const [consent, setConsent] = useState<Consent>(NO_CONSENT);
  const [accept, busy, error] = useAction(async () => {
    await api('/legal/accept', { method: 'POST', json: consentBody(consent) });
    await reload();
  });
  if (!user?.legal.mustAcceptTerms) return null;
  const updated = !!user.legal.termsVersion;
  return (
    <Modal
      title={updated ? 'We have updated our terms' : 'Please review our terms'}
      onClose={stay}
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={() => void logout()}>Sign out</Button>
          <Button busy={busy} disabled={!consentComplete(consent)} onClick={() => void accept()}>Agree and continue</Button>
        </>
      }
    >
      <p>
        {updated
          ? `Our Terms of Service and Privacy Policy changed on ${legal.effectiveDate}. Please read them and agree to continue using ${legal.siteName}.`
          : `To keep using ${legal.siteName}, please read and agree to our Terms of Service and Privacy Policy. They explain how sessions work, how we keep students safe, and how we look after your information.`}
      </p>
      <ConsentControls value={consent} onChange={setConsent} action="using this account" />
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}
