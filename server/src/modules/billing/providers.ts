/**
 * PAYMENT PROVIDER ABSTRACTION (groundwork for a future paywall)
 * --------------------------------------------------------------
 * The rest of the app only talks to this interface. To go live with Stripe:
 *   1. npm i stripe
 *   2. implement `StripeProvider` below (checkout session, webhook verify,
 *      map events → upsertSubscription / recordPayment in billing.service.ts)
 *   3. set BILLING_PROVIDER=stripe and BILLING_ENABLED=true
 * PayPal follows the same shape. No route, schema or UI contract changes.
 */
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';

export interface CheckoutRequest {
  userId: string;
  email: string;
  planKey: string;
  providerPriceRef: string | null;
  successUrl: string;
  cancelUrl: string;
}

/** Normalised event emitted by any provider's webhook. */
export type BillingEventNormalized =
  | {
      kind: 'subscription.updated';
      eventId: string;
      userId: string;
      planKey: string;
      status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE';
      providerCustomerRef?: string;
      providerSubscriptionRef: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
    }
  | {
      kind: 'payment.succeeded' | 'payment.failed' | 'payment.refunded';
      eventId: string;
      userId: string;
      amountCents: number;
      currency: string;
      providerPaymentRef: string;
      bookingId?: string;
    }
  | { kind: 'ignored'; eventId: string; type: string };

export interface PaymentProvider {
  readonly name: 'none' | 'stripe' | 'paypal';
  createCheckout(req: CheckoutRequest): Promise<{ redirectUrl: string }>;
  /** Verify the webhook signature against the RAW body and normalise the event. */
  parseWebhook(req: Request, rawBody: Buffer): Promise<BillingEventNormalized>;
  createPortalSession?(providerCustomerRef: string, returnUrl: string): Promise<{ redirectUrl: string }>;
}

class NullProvider implements PaymentProvider {
  readonly name = 'none' as const;
  async createCheckout(): Promise<{ redirectUrl: string }> {
    throw new AppError(501, 'BILLING_DISABLED', 'Online payments are not enabled yet');
  }
  async parseWebhook(): Promise<BillingEventNormalized> {
    throw new AppError(404, 'BILLING_DISABLED', 'No payment provider configured');
  }
}

// class StripeProvider implements PaymentProvider { ... }   ← implement when ready
// class PayPalProvider implements PaymentProvider { ... }

let instance: PaymentProvider | null = null;

export function paymentProvider(): PaymentProvider {
  if (instance) return instance;
  switch (env.BILLING_PROVIDER) {
    case 'none':
      instance = new NullProvider();
      break;
    default:
      throw new Error(`BILLING_PROVIDER=${env.BILLING_PROVIDER} is not implemented yet (see providers.ts)`);
  }
  return instance;
}
