/** Activity log — who did what (approvals, role changes, deletions, branding…). */
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Empty, ErrorText, Loading, PageHeader, Segmented, useApi } from '../../components/ui';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { firstName: string; lastName: string } | null;
}

/** Plain-language labels for audit actions. */
const LABELS: Record<string, string> = {
  'user.registered': 'signed up',
  'user.approved': 'approved a sign-up',
  'user.rejected': 'declined a sign-up',
  'user.created': 'invited someone',
  'user.suspended': 'paused an account',
  'user.reactivated': 'reactivated an account',
  'user.deleted': 'deleted an account',
  'user.roles_changed': "changed someone's roles",
  'user.password_reset': 'reset their password',
  'user.password_changed': 'changed their password',
  'user.locked_out': 'was locked out after failed sign-ins',
  'role.created': 'created a role',
  'role.updated': 'edited a role',
  'role.deleted': 'deleted a role',
  'booking.created': 'booked a session',
  'booking.confirmed': 'confirmed a session',
  'booking.declined': 'declined a request',
  'booking.started': 'started a session',
  'booking.ended': 'ended a session',
  'booking.cancelled': 'cancelled a session',
  'booking.no_show': 'marked a session as missed',
  'session.link_posted': 'shared a Meet link',
  'service.deleted': 'deleted a service',
  'resource.created': 'added a resource',
  'resource.deleted': 'deleted a resource',
  'resource.assigned': 'assigned a resource',
  'branding.updated': 'changed the branding',
  'branding.reset': 'reset the branding',
  'branding.logo_uploaded': 'uploaded a new logo',
  'availability.rules_replaced': 'updated weekly availability',
};

export function ActivityPage() {
  const { user } = useAuth();
  const [type, setType] = useState('');
  const list = useApi<AuditRow[]>(`/audit?limit=200${type ? `&entityType=${type}` : ''}`);
  const fmt = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: user?.timezone }).format(new Date(iso));

  return (
    <div className="page">
      <PageHeader title="Activity log" description="Important changes, newest first. Useful when you need to know who did what." />
      <div className="toolbar">
        <Segmented label="Filter" value={type} onChange={setType}
          options={[{ value: '', label: 'All' }, { value: 'user', label: 'People' }, { value: 'booking', label: 'Sessions' }, { value: 'role', label: 'Roles' }, { value: 'settings', label: 'Branding' }]} />
      </div>
      <ErrorText>{list.error}</ErrorText>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty icon="activity" title="Nothing recorded yet" /> : (
        <ol className="timeline">
          {list.data.map((r) => (
            <li key={r.id}>
              <time>{fmt(r.createdAt)}</time>
              <span><strong>{r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : 'The system'}</strong> {LABELS[r.action] ?? r.action}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
