/**
 * The fields saved on a user when they agree to the Terms of Service and Privacy
 * Policy (sign-up, booking without an account, or re-accepting updated terms).
 */
import { settings } from '../settings/general.js';

export type AgeConfirmation = 'adult' | 'guardian';

export function consentRecord(age: AgeConfirmation, at: Date = new Date()) {
  return {
    termsAcceptedAt: at,
    termsVersion: settings().legal.termsVersion,
    guardianConsent: age === 'guardian',
  };
}
