/**
 * One session, with exactly the next thing each person can do.
 * Buttons come from `session.actions` (decided by the server), so a tutor
 * sees Confirm / Add Meet link / Start / End, a student sees Join, and
 * nobody sees a button the server would refuse.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { refreshMessageSummary, useMessageSummary } from '../lib/messages';
import { api, downloadFile } from '../lib/api';
import { fmtTime } from '../lib/time';
import type { Session } from '../lib/types';
import { Icon } from './Icon';
import { ReportDialog } from './ReportDialog';
import { Button, ConfirmDialog, ErrorText, Modal, Pill, useAction, useToast, type Tone } from './ui';

function statusFor(s: Session): { tone: Tone; label: string } {
  if (s.isLive) return { tone: 'live', label: 'Live now' };
  switch (s.status) {
    case 'PENDING':
      return s.myRole === 'student' ? { tone: 'neutral', label: 'Waiting for tutor' } : { tone: 'attention', label: 'Needs your OK' };
    case 'CONFIRMED':
      return { tone: 'brand', label: 'Confirmed' };
    case 'COMPLETED':
      return { tone: 'good', label: s.endedAt && new Date(s.endedAt) < new Date(s.endsAt) ? 'Ended early' : 'Completed' };
    case 'DECLINED':
      return { tone: 'bad', label: 'Declined' };
    case 'CANCELLED':
      return { tone: 'neutral', label: 'Cancelled' };
    case 'NO_SHOW':
      return { tone: 'bad', label: 'Missed' };
  }
}

function DateBlock({ iso, tz }: { iso: string; tz?: string }) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...o, timeZone: tz }).format(d);
  return (
    <div className="date-block" aria-hidden>
      <span className="date-month">{part({ month: 'short' })}</span>
      <span className="date-day">{part({ day: 'numeric' })}</span>
      <span className="date-weekday">{part({ weekday: 'short' })}</span>
    </div>
  );
}

type Dialog = 'decline' | 'cancel' | 'end' | 'noShow' | null;

export function SessionCard({
  session: s,
  onChange,
  showActivity = true,
}: {
  session: Session;
  onChange: () => void;
  showActivity?: boolean;
}) {
  const { user, can } = useAuth();
  const toast = useToast();
  const tz = user?.timezone;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [asking, setAsking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const canMessage = can('messages:send');
  const summary = useMessageSummary(canMessage && s.myRole === 'student');
  const openQuestion = summary.openQuestions.find((q) => q.bookingId === s.id);
  const [editingLink, setEditingLink] = useState(false);
  const [link, setLink] = useState(s.meetingUrl ?? '');
  const status = statusFor(s);
  const other = s.myRole === 'tutor' ? s.student : s.myRole === 'student' ? s.tutor : null;
  const a = s.actions;

  const [act, busy, error] = useAction(async (path: string, done: string, body?: unknown) => {
    await api(`/scheduling/bookings/${s.id}/${path}`, { method: 'POST', json: body ?? {} });
    toast(done);
    onChange();
  });
  const [saveLink, savingLink, linkError] = useAction(async () => {
    await api(`/sessions/${s.id}/meeting-link`, { method: 'POST', json: { meetingUrl: link.trim() } });
    setEditingLink(false);
    toast(s.meetingUrl ? 'Meet link updated — the student was emailed' : 'Meet link added — the student was emailed');
    onChange();
  });

  const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }).format(new Date(s.startsAt));
  const finished = ['COMPLETED', 'CANCELLED', 'DECLINED', 'NO_SHOW'].includes(s.status);
  const upcoming = (s.status === 'PENDING' || s.status === 'CONFIRMED') && new Date(s.endsAt) > new Date();
  const messageLink = other && canMessage ? `/messages?with=${other.id}&as=${s.myRole === 'student' ? 'tutor' : 'student'}` : null;

  return (
    <article className={`session ${s.isLive ? 'is-live' : ''} ${finished ? 'is-finished' : ''} ${s.status === 'PENDING' && s.myRole !== 'student' ? 'needs-me' : ''}`}>
      <DateBlock iso={s.startsAt} tz={tz} />
      <div className="session-main">
        <div className="session-top">
          <h3 className="session-title">{s.service}</h3>
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <p className="session-when">
          <span className="sr-only">{fullDate}, </span>
          {fmtTime(s.startsAt, tz)} – {fmtTime(s.endsAt, tz)}
          {other ? <> with {s.myRole === 'tutor' && can('students:read_notes') ? <Link to={`/students/${s.student.id}`} className="person-link">{other.name}</Link> : <strong>{other.name}</strong>}</> : <> — {s.student.name} with {s.tutor.name}</>}
        </p>

        {s.notes && s.myRole !== 'student' && <p className="session-note">“{s.notes}”</p>}
        {s.reason && (s.status === 'CANCELLED' || s.status === 'DECLINED') && <p className="session-note muted">Reason: {s.reason}</p>}
        {a.cancelTooLate && <p className="session-note muted">It's too late to cancel online. Message your tutor if you can't make it.</p>}

        {/* Primary actions */}
        <div className="session-actions">
          {a.confirm && <Button icon="check" busy={busy} onClick={() => act('confirm', 'Confirmed — the student was emailed')}>Confirm</Button>}
          {a.decline && <Button variant="secondary" onClick={() => setDialog('decline')}>Decline</Button>}

          {s.meetingUrl && !finished && (
            <a className={`btn ${s.myRole === 'student' || s.isLive ? 'primary' : 'secondary'}`} href={s.meetingUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="video" size={18} /> {s.myRole === 'student' ? 'Join Google Meet' : 'Open Meet'}
            </a>
          )}
          {a.postLink && !s.meetingUrl && !editingLink && (
            <Button variant="secondary" icon="link" onClick={() => setEditingLink(true)}>Add Meet link</Button>
          )}
          {a.start && <Button variant={s.meetingUrl ? 'secondary' : 'primary'} icon="play" busy={busy} onClick={() => act('start', 'Session started — the student was told')}>Start session</Button>}
          {a.end && <Button variant={s.isLive ? 'primary' : 'secondary'} icon="stop" onClick={() => setDialog('end')}>End session</Button>}

          {s.myRole === 'student' && s.status === 'CONFIRMED' && !s.meetingUrl && (
            <span className="hint-inline">Your tutor will add the Meet link here.</span>
          )}
          {s.myRole === 'student' && s.status === 'PENDING' && <span className="hint-inline">We'll email you when it's confirmed.</span>}

          <span className="spacer" />
          {messageLink && <Link className="link-btn" to={messageLink}>Message {other!.name.split(' ')[0]}</Link>}
          <MoreMenu items={[
            canMessage && s.myRole === 'tutor' && upcoming && { label: 'Ask a question before the session', onClick: () => setAsking(true) },
            upcoming && s.myRole !== 'staff' && { label: 'Add to calendar', onClick: () => void downloadFile(`/sessions/${s.id}/calendar.ics`, `${s.service.replace(/[^\w-]+/g, '-')}.ics`).catch(() => toast("Couldn't download the calendar file")) },
            a.postLink && !!s.meetingUrl && !editingLink && { label: 'Change Meet link', onClick: () => setEditingLink(true) },
            a.noShow && { label: "Mark: student didn't come", onClick: () => setDialog('noShow') },
            a.cancel && { label: 'Cancel session', onClick: () => setDialog('cancel'), danger: true },
            s.myRole === 'student' && { label: 'Report a problem', onClick: () => setReporting(true), danger: true },
          ]} />
        </div>

        {editingLink && (
          <form
            className="link-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveLink();
            }}
          >
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              aria-label="Google Meet link"
              autoFocus
              required
            />
            <Button busy={savingLink}>Save link</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditingLink(false); setLink(s.meetingUrl ?? ''); }}>Cancel</Button>
            <small className="hint">Create a meeting in Google Meet, then paste its link. The student is emailed right away.</small>
          </form>
        )}
        {/* Prompt for a recap only on recent sessions; an existing recap stays editable. */}
        {(s.recap || (s.canRecap && Date.now() - new Date(s.endsAt).getTime() < 14 * 864e5)) && <RecapBlock session={s} onSaved={onChange} />}
        {(s.canRate || s.feedback) && <FeedbackBlock session={s} onSaved={onChange} />}
        {openQuestion && (
          <Link className="session-question" to={`/messages?c=${openQuestion.conversationId}`}>
            <Icon name="help" size={18} />
            <span><strong>{openQuestion.tutorName} asked you a question</strong> about this session.</span>
            <span className="session-question-cta">Answer</span>
          </Link>
        )}
        <ErrorText>{error || linkError}</ErrorText>

        {showActivity && s.posts.length > 1 && (
          <details className="activity">
            <summary>History</summary>
            <ol>
              {[...s.posts].reverse().map((p) => (
                <li key={p.id}>
                  <time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(p.createdAt))}</time>
                  <span>{p.kind === 'MEETING_LINK' ? `${p.author} shared the Meet link` : p.kind === 'NOTE' ? `${p.author}: ${p.message}` : p.message}</span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {reporting && <ReportDialog tutor={s.tutor} bookingId={s.id} onClose={() => setReporting(false)} onDone={() => { setReporting(false); toast('Report sent to the team. Thank you for telling us.'); }} />}
      {asking && <AskQuestion session={s} onClose={() => setAsking(false)} onDone={() => { setAsking(false); toast(`Question sent — ${s.student.name.split(' ')[0]} was emailed`); }} />}

      {dialog === 'decline' && (
        <ConfirmDialog title="Decline this request?" confirmLabel="Decline request" danger reasonLabel="Message for the student (optional)"
          onConfirm={(reason) => act('decline', 'Request declined — the student was emailed', { reason })} onClose={() => setDialog(null)}>
          <p>{s.student.name} will be told, and the time becomes free for others to book.</p>
        </ConfirmDialog>
      )}
      {dialog === 'cancel' && (
        <ConfirmDialog title="Cancel this session?" confirmLabel="Cancel session" danger reasonLabel="Reason (shared with the other person)"
          onConfirm={(reason) => act('cancel', 'Session cancelled', { reason })} onClose={() => setDialog(null)}>
          <p>{s.service}, {fullDate} at {fmtTime(s.startsAt, tz)}. Both of you get an email.</p>
        </ConfirmDialog>
      )}
      {dialog === 'end' && (
        <ConfirmDialog title="End the session now?" confirmLabel="End session" onConfirm={() => act('end', 'Session ended')} onClose={() => setDialog(null)}>
          <p>{new Date() < new Date(s.endsAt) ? `It was booked until ${fmtTime(s.endsAt, tz)}. Ending early frees up the rest of the time.` : 'This marks the session as completed.'}</p>
        </ConfirmDialog>
      )}
      {dialog === 'noShow' && (
        <ConfirmDialog title="Mark as missed?" confirmLabel="Mark as missed" onConfirm={() => act('no-show', 'Marked as missed')} onClose={() => setDialog(null)}>
          <p>Use this when {s.student.name} didn't join. It stays in the history as missed.</p>
        </ConfirmDialog>
      )}
    </article>
  );
}

function AskQuestion({ session, onClose, onDone }: { session: Session; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState('');
  const [submit, busy, error] = useAction(async () => {
    await api('/messages/questions', { method: 'POST', json: { bookingId: session.id, body: body.trim() } });
    void refreshMessageSummary();
    onDone();
  });
  const first = session.student.name.split(' ')[0];
  return (
    <Modal title={`Ask ${first} before the session`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!body.trim()} onClick={() => void submit()}>Send question</Button></>}>
      <p className="muted">{first} is emailed and sees it highlighted until they answer. The answer arrives in your Messages.</p>
      <label className="field">
        <span>Your question</span>
        <textarea rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Which topics would you like to focus on? Is there homework you're stuck on?" />
      </label>
      <ErrorText>{error}</ErrorText>
    </Modal>
  );
}

function RecapBlock({ session: s, onSaved }: { session: Session; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.recap ?? '');
  const [save, busy, error] = useAction(async () => {
    const r = await api<{ emailed: boolean }>(`/sessions/${s.id}/recap`, { method: 'PUT', json: { recap: text.trim() } });
    setEditing(false);
    toast(r.emailed ? `Recap saved — ${s.student.name.split(' ')[0]} was emailed` : 'Recap updated');
    onSaved();
  });
  if (editing) {
    return (
      <div className="recap editing">
        <label className="field">
          <span>Session recap</span>
          <textarea rows={5} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={'What we covered:\n\nHomework before next time:'} autoFocus />
          <small className="hint">{s.recapPostedAt ? 'Edits are not emailed again.' : `${s.student.name.split(' ')[0]} is emailed when you save.`}</small>
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="button-row tight">
          <Button busy={busy} disabled={!text.trim()} onClick={() => void save()}>Save recap</Button>
          <Button variant="ghost" onClick={() => { setEditing(false); setText(s.recap ?? ''); }}>Cancel</Button>
        </div>
      </div>
    );
  }
  if (!s.recap) {
    return (
      <div className="recap empty-recap">
        <span>Write a short recap: what you covered and any homework. {s.student.name.split(' ')[0]} is emailed a copy.</span>
        <Button variant="secondary" onClick={() => setEditing(true)}>Write recap</Button>
      </div>
    );
  }
  return (
    <div className="recap">
      <div className="recap-head">
        <strong>Recap from {s.tutor.name.split(' ')[0]}</strong>
        {s.canRecap && <button className="link-btn" onClick={() => setEditing(true)}>Edit</button>}
      </div>
      <p>{s.recap}</p>
    </div>
  );
}

function Stars({ value, onPick, label }: { value: number; onPick?: (n: number) => void; label: string }) {
  return (
    <span className={`stars ${onPick ? 'pickable' : ''}`} role={onPick ? 'radiogroup' : 'img'} aria-label={onPick ? label : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= value ? 'on' : ''} onClick={() => onPick(n)}>
            <Icon name="star" size={20} />
          </button>
        ) : (
          <span key={n} className={n <= value ? 'on' : ''}><Icon name="star" size={16} /></span>
        ),
      )}
    </span>
  );
}

function FeedbackBlock({ session: s, onSaved }: { session: Session; onSaved: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(s.feedback?.rating ?? 0);
  const [comment, setComment] = useState(s.feedback?.comment ?? '');
  const [editing, setEditing] = useState(!s.feedback);
  const [send, busy, error] = useAction(async () => {
    await api(`/sessions/${s.id}/feedback`, { method: 'PUT', json: { rating, comment: comment.trim() || undefined } });
    setEditing(false);
    toast('Thanks for your feedback');
    onSaved();
  });

  if (s.myRole !== 'student') {
    return s.feedback ? (
      <div className="feedback-view">
        <Stars value={s.feedback.rating} label="Rating" />
        <span>{s.student.name.split(' ')[0]} rated this session{s.feedback.comment ? `: “${s.feedback.comment}”` : '.'}</span>
      </div>
    ) : null;
  }
  if (!editing && s.feedback) {
    return (
      <div className="feedback-view">
        <Stars value={s.feedback.rating} label="Your rating" />
        <span>You rated this session{s.feedback.comment ? `: “${s.feedback.comment}”` : '.'}</span>
        {s.canRate && <button className="link-btn" onClick={() => setEditing(true)}>Change</button>}
      </div>
    );
  }
  return (
    <div className="feedback-form">
      <span className="feedback-q">How was this session?</span>
      <Stars value={rating} onPick={setRating} label="Rate this session from 1 to 5 stars" />
      {rating > 0 && (
        <>
          <label className="sr-only" htmlFor={`fb-${s.id}`}>Comment (optional)</label>
          <textarea id={`fb-${s.id}`} rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything your tutor or the team should know? (optional)" />
          <div className="button-row tight">
            <Button busy={busy} onClick={() => void send()}>Send feedback</Button>
            {s.feedback && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

type MenuItem = { label: string; onClick: () => void; danger?: boolean };

/** Secondary actions behind one "More" button, so each card shows only its main action. */
function MoreMenu({ items }: { items: (MenuItem | false | undefined | null)[] }) {
  const list = items.filter(Boolean) as MenuItem[];
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="more-menu" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" className="btn ghost more-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
        More <Icon name="chevronRight" size={14} className="more-chevron" />
      </button>
      {open && (
        <div className="more-items" role="menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {list.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
