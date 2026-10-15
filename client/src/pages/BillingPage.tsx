/**
 * Plan & payments. Hidden from navigation until BILLING_ENABLED=true; the
 * checkout button returns a clear message until a payment provider exists.
 */
import { Badge, Empty, ErrorText, Loading, PageHeader, useAction, useApi } from '../components/ui';
import { api } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/time';

interface Plan { id: string; key: string; name: string; description: string | null; priceCents: number; currency: string; interval: string }
interface MyBilling {
  billingEnabled: boolean;
  entitlements: string[];
  subscriptions: { id: string; status: string; currentPeriodEnd: string | null; plan: Plan }[];
  payments: { id: string; amountCents: number; currency: string; status: string; createdAt: string }[];
}

export function BillingPage() {
  const me = useApi<MyBilling>('/billing/me');
  const plans = useApi<Plan[]>('/billing/plans');
  const [checkout, busy, error] = useAction(async (planKey: string) => {
    const { redirectUrl } = await api<{ redirectUrl: string }>('/billing/checkout', { method: 'POST', json: { planKey } });
    window.location.href = redirectUrl;
  });
  const active = me.data?.subscriptions.find((s) => s.status === 'ACTIVE' || s.status === 'TRIALING');

  return (
    <section>
      <PageHeader title="Plan & payments" />
      <ErrorText>{me.error || plans.error || error}</ErrorText>
      {me.loading && !me.data ? <Loading /> : (
        <>
          <div className="card">
            <h2>Current plan</h2>
            {active ? (
              <p><strong>{active.plan.name}</strong> <Badge tone="good">{active.status.toLowerCase()}</Badge>{active.currentPeriodEnd && <span className="muted"> · renews {fmtDate(active.currentPeriodEnd)}</span>}</p>
            ) : <p className="muted">No active plan.</p>}
          </div>
          {!active && (plans.data?.length ?? 0) > 0 && (
            <div className="grid">
              {plans.data!.map((p) => (
                <div key={p.id} className="card">
                  <h3>{p.name}</h3>
                  <p className="stat-value">{fmtMoney(p.priceCents, p.currency)}<span className="muted small"> / {p.interval.toLowerCase().replace('_', ' ')}</span></p>
                  {p.description && <p className="muted">{p.description}</p>}
                  <button disabled={busy} onClick={() => checkout(p.key)}>Choose</button>
                </div>
              ))}
            </div>
          )}
          <h2>Payments</h2>
          {me.data?.payments.length ? (
            <table>
              <thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{me.data.payments.map((p) => <tr key={p.id}><td>{fmtDate(p.createdAt)}</td><td>{fmtMoney(p.amountCents, p.currency)}</td><td>{p.status.toLowerCase()}</td></tr>)}</tbody>
            </table>
          ) : <Empty>No payments yet.</Empty>}
        </>
      )}
    </section>
  );
}
