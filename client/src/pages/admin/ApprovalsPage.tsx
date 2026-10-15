/** Admin approval queue: pending student registrations, oldest first. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/time';
import { Empty, PageHeader } from '../../components/ui';

interface PendingUser { id: string; email: string; firstName: string; lastName: string; timezone: string; createdAt: string }

export function ApprovalsPage() {
  const [items, setItems] = useState<PendingUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => api<{ items: PendingUser[] }>('/users?status=PENDING&pageSize=100').then((r) => setItems(r.items)),
    [],
  );
  useEffect(() => void load(), [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    const reason = action === 'reject' ? (prompt('Reason (optional, emailed to the student):') ?? undefined) : undefined;
    setBusy(id);
    try {
      await api(`/users/${id}/${action}`, { method: 'POST', json: action === 'reject' ? { reason } : {} });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <PageHeader title="Pending approvals" subtitle="New student registrations, oldest first. Approving emails the student." />
      {items.length === 0 ? (
        <Empty>No one is waiting. 🎉</Empty>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Timezone</th><th>Registered</th><th /></tr></thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.firstName} {u.lastName}</td>
                <td>{u.email}</td>
                <td>{u.timezone}</td>
                <td>{fmtDateTime(u.createdAt)}</td>
                <td className="row end">
                  <button disabled={busy === u.id} onClick={() => act(u.id, 'approve')}>Approve</button>
                  <button disabled={busy === u.id} className="danger" onClick={() => act(u.id, 'reject')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
