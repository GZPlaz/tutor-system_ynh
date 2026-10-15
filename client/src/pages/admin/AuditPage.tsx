/** Read-only audit trail (approvals, role changes, cancellations, link posts…). */
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Empty, ErrorText, Loading, PageHeader, useApi } from '../../components/ui';
import { fmtDateTime } from '../../lib/time';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { email: string; firstName: string; lastName: string } | null;
}

export function AuditPage() {
  const { user } = useAuth();
  const [entityType, setEntityType] = useState('');
  const list = useApi<AuditRow[]>(`/audit?limit=200${entityType ? `&entityType=${entityType}` : ''}`);
  return (
    <section>
      <PageHeader title="Audit log" subtitle="Security-relevant actions, newest first." />
      <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
        <option value="">All</option>
        {['user', 'role', 'booking', 'resource'].map((t) => <option key={t}>{t}</option>)}
      </select>
      <ErrorText>{list.error}</ErrorText>
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.length ? (
        <Empty>No entries.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.createdAt, user?.timezone)}</td>
                  <td>{r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'system'}</td>
                  <td><code>{r.action}</code></td>
                  <td className="small muted">{r.metadata ? JSON.stringify(r.metadata).slice(0, 160) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
