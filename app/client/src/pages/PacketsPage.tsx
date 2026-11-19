/**
 * /packets — free study packets anyone can open or download, no account needed.
 * Packets are grouped by subject; a subject filter appears once there are several.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PublicFrame } from '../components/PublicFrame';
import { Empty, Loading, useApi } from '../components/ui';
import { apiUrl } from '../lib/api';
import { usePublicConfig } from '../lib/config';
import { fileKind, fmtBytes } from '../lib/files';
import type { PublicPacket } from '../lib/types';

const ALL = '__all__';

export function PacketsPage() {
  const packets = useApi<PublicPacket[]>('/public/packets');
  const config = usePublicConfig();
  const [subject, setSubject] = useState(ALL);

  const bySubject = useMemo(() => {
    const map = new Map<string, PublicPacket[]>();
    for (const p of packets.data ?? []) map.set(p.subject, [...(map.get(p.subject) ?? []), p]);
    return [...map.entries()];
  }, [packets.data]);

  const shown = subject === ALL ? bySubject : bySubject.filter(([s]) => s === subject);

  return (
    <PublicFrame wide>
      <header className="packets-hero">
        <p className="eyebrow"><Icon name="sparkle" size={16} /> Free for everyone</p>
        <h1>Free study packets</h1>
        <p className="muted">
          Practice packets written by our tutors. Open them in your browser or download and print them. No account needed.
        </p>
      </header>

      {packets.loading && !packets.data ? (
        <Loading label="Loading packets" />
      ) : packets.error ? (
        <Empty icon="alert" title="We couldn't load the packets">Please refresh the page in a moment.</Empty>
      ) : !bySubject.length ? (
        <Empty icon="book" title="No packets yet">New practice packets are on the way. Check back soon.</Empty>
      ) : (
        <>
          {bySubject.length > 1 && (
            <div className="segmented packet-filter" role="tablist" aria-label="Subject">
              {[[ALL, 'All subjects'] as const, ...bySubject.map(([s]) => [s, s] as const)].map(([value, label]) => (
                <button key={value} role="tab" aria-selected={subject === value} className={subject === value ? 'active' : ''} onClick={() => setSubject(value)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {shown.map(([name, items]) => (
            <section key={name} className="packet-subject" aria-labelledby={`subject-${name}`}>
              <h2 id={`subject-${name}`}>{name}</h2>
              <ul className="packet-list">
                {items.map((p) => (
                  <li key={p.id} className="packet-card">
                    <span className="packet-icon" aria-hidden><Icon name="file" size={26} /></span>
                    <div className="packet-body">
                      <h3>{p.title}</h3>
                      {p.description && <p>{p.description}</p>}
                      <p className="packet-meta">
                        {fileKind(p.mimeType)}
                        {p.pageCount ? ` · ${p.pageCount} page${p.pageCount > 1 ? 's' : ''}` : ''} · {fmtBytes(p.sizeBytes)}
                      </p>
                    </div>
                    <div className="packet-actions">
                      {p.mimeType === 'application/pdf' && (
                        <a className="btn secondary" href={apiUrl(`/public/packets/${p.id}/download?view=1`)} target="_blank" rel="noopener">
                          <Icon name="external" size={18} /> Open
                        </a>
                      )}
                      <a className="btn primary" href={apiUrl(`/public/packets/${p.id}/download`)} download={p.originalName}>
                        <Icon name="download" size={18} /> Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <aside className="panel packets-cta">
        <div>
          <h2 className="panel-title">Want help working through a packet?</h2>
          <p className="muted">Our tutors can go over every question with you in a one-on-one session, for free.</p>
        </div>
        <div className="button-row">
          {config?.guestBooking ? (
            <Link to="/book" className="btn primary"><Icon name="calendarPlus" size={18} /> Book a session</Link>
          ) : config?.registrationOpen ? (
            <Link to="/register" className="btn primary">Create a free account</Link>
          ) : (
            <Link to="/login" className="btn primary">Sign in to book</Link>
          )}
        </div>
      </aside>
    </PublicFrame>
  );
}
