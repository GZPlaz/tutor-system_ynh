/**
 * The Session Feed: upcoming/recent sessions for the signed-in user.
 * Students see a "Join Google Meet" button once the tutor posts the link;
 * tutors see a "Post Meet link" box when the posting window is open.
 * Polls every 30 s so a newly posted link shows up without a refresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { fmtDateTime } from '../lib/time';
import { Empty, PageHeader } from '../components/ui';

interface FeedItem {
  id: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: string;
  myRole: 'tutor' | 'student';
  counterpart: { firstName: string; lastName: string };
  meetingUrl: string | null;
  canPostLink: boolean;
  linkWindowOpensAt: string;
  isLive: boolean;
  posts: { id: string; kind: string; message: string | null; author: string; createdAt: string }[];
}

export function SessionFeedPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<FeedItem[]>('/sessions/feed').then(setItems).catch((e) => setError(String(e.message))), []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <section>
      <PageHeader title="Session feed" subtitle="Join links appear here shortly before each session. This page refreshes automatically." />
      {error && <p className="error">{error}</p>}
      {items.length === 0 && <Empty>No sessions in the next two weeks.</Empty>}
      <ul className="feed">
        {items.map((s) => (
          <li key={s.id} className={`card ${s.isLive ? 'live' : ''} ${s.status === 'CANCELLED' ? 'cancelled' : ''}`}>
            <header>
              <strong>{s.service}</strong> with {s.counterpart.firstName} {s.counterpart.lastName}
              {s.isLive && <span className="badge info">Live now</span>}
              {s.status === 'CANCELLED' && <span className="badge neutral">Cancelled</span>}
            </header>
            <p>{fmtDateTime(s.startsAt, user?.timezone)}</p>

            {s.meetingUrl ? (
              <a className="button" href={s.meetingUrl} target="_blank" rel="noopener noreferrer">Join Google Meet</a>
            ) : s.myRole === 'student' && s.status === 'CONFIRMED' ? (
              <p className="muted">Your tutor will post the join link shortly before the session.</p>
            ) : null}

            {s.myRole === 'tutor' && s.canPostLink && <PostLinkForm bookingId={s.id} onPosted={load} hasLink={!!s.meetingUrl} />}
            {s.myRole === 'tutor' && !s.canPostLink && !s.meetingUrl && s.status === 'CONFIRMED' && (
              <p className="muted">You can post the Meet link from {fmtDateTime(s.linkWindowOpensAt, user?.timezone)}.</p>
            )}

            {s.posts.length > 0 && (
              <ol className="posts">
                {s.posts.map((p) => (
                  <li key={p.id}><span className="muted">{fmtDateTime(p.createdAt, user?.timezone)} · {p.author}:</span> {p.kind === 'MEETING_LINK' ? 'posted the join link' : p.message}</li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PostLinkForm({ bookingId, onPosted, hasLink }: { bookingId: string; onPosted: () => void; hasLink: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="row"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          await api(`/sessions/${bookingId}/meeting-link`, { method: 'POST', json: { meetingUrl: new FormData(form).get('meetingUrl') } });
          form.reset();
          setError(null);
          onPosted();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Could not post link');
        }
      }}
    >
      <input name="meetingUrl" placeholder="https://meet.google.com/abc-defg-hij" required pattern="https://meet\.google\.com/.+" />
      <button>{hasLink ? 'Replace link' : 'Post Meet link'}</button>
      {error && <small className="error">{error}</small>}
    </form>
  );
}
