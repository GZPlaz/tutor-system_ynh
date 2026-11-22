/**
 * Messages — private threads between students and tutors.
 *
 *   /messages                     list of threads (and the newest one on wide screens)
 *   /messages?c=<id>              a thread
 *   /messages?with=<userId>&as=tutor|student   open (or start) the thread with someone
 *   /messages?scope=all           staff with messages:read_any: every thread, read-only
 *
 * Threads refresh every few seconds while the tab is visible. Tutors' questions about a
 * session are shown as cards; the student answers with one click.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Avatar, Button, ConfirmDialog, Empty, ErrorText, Loading, Modal, PageHeader, Pill, errorMessage, useApi, useToast } from '../components/ui';
import { api } from '../lib/api';
import { refreshMessageSummary } from '../lib/messages';
import { ReportDialog } from '../components/ReportDialog';
import { fmtDate, fmtDateTime, fmtTime } from '../lib/time';
import type { Contact, ConversationSummary, Thread, ThreadMessage } from '../lib/types';

const THREAD_POLL_MS = 8_000;
const LIST_POLL_MS = 20_000;
const MAX_LEN = 4000;

/** Re-run `fn` every `ms` while the tab is visible. */
function usePoll(fn: () => void, ms: number, enabled: boolean) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => document.visibilityState === 'visible' && saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

export function MessagesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const staffView = params.get('scope') === 'all' && can('messages:read_any');
  const selected = params.get('c');
  const [archivedView, setArchivedView] = useState(false);
  const list = useApi<ConversationSummary[]>(`/messages/conversations?scope=${staffView ? 'all' : 'mine'}${!staffView && archivedView ? '&archived=true' : ''}`);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  usePoll(() => void list.reload(), LIST_POLL_MS, true);

  const select = useCallback((id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('with');
    next.delete('as');
    if (id) next.set('c', id);
    else next.delete('c');
    setParams(next, { replace: !id });
  }, [params, setParams]);

  // ?with=<userId>: open or create the thread with that person (from a session card or a link).
  const withUser = params.get('with');
  const as = params.get('as');
  useEffect(() => {
    if (!withUser) return;
    let alive = true;
    api<{ id: string }>('/messages/conversations', { method: 'POST', json: { userId: withUser, relation: as === 'tutor' || as === 'student' ? as : undefined } })
      .then((c) => { if (alive) { select(c.id); void list.reload(); } })
      .catch((e) => alive && setStartError(errorMessage(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withUser, as]);

  const items = list.data ?? [];
  const current = items.find((c) => c.id === selected) ?? null;

  return (
    <div className="page wide messages-page">
      <PageHeader
        title="Messages"
        description={staffView ? 'Every conversation, read-only. Each conversation you open is recorded in the activity log.' : 'Private conversations with your tutors and students.'}
        action={
          <div className="button-row tight">
            {can('messages:read_any') && (
              <Link className="btn ghost" to={staffView ? '/messages' : '/messages?scope=all'}>{staffView ? 'My messages' : 'All conversations'}</Link>
            )}
            {!staffView && can('messages:send') && <Button icon="plus" onClick={() => setStarting(true)}>New message</Button>}
          </div>
        }
      />
      <ErrorText>{list.error || startError}</ErrorText>

      <div className={`messenger ${selected ? 'has-selection' : ''}`}>
        <aside className="thread-list" aria-label="Conversations">
          {!staffView && (
            <div className="thread-list-tabs" role="tablist" aria-label="Which conversations">
              <button role="tab" aria-selected={!archivedView} className={!archivedView ? 'active' : ''} onClick={() => { setArchivedView(false); select(null); }}>Inbox</button>
              <button role="tab" aria-selected={archivedView} className={archivedView ? 'active' : ''} onClick={() => { setArchivedView(true); select(null); }}>Archived</button>
            </div>
          )}
          {list.loading && !list.data ? <Loading /> : !items.length ? (
            <div className="thread-list-empty">
              <p><strong>{archivedView ? 'Nothing archived.' : 'No conversations yet.'}</strong></p>
              <p className="muted">{staffView ? 'Nobody has sent a message yet.' : 'Start one with "New message", or from a session.'}</p>
            </div>
          ) : (
            <ul>
              {items.map((c) => {
                const title = c.other?.name ?? `${c.student.name} ↔ ${c.tutor.name}`;
                return (
                  <li key={c.id}>
                    <button className={`thread-item ${c.id === selected ? 'active' : ''} ${c.unread ? 'unread' : ''}`} onClick={() => select(c.id)} aria-current={c.id === selected ? 'true' : undefined}>
                      <Avatar name={c.other?.name ?? c.student.name} size={36} />
                      <span className="thread-item-text">
                        <span className="thread-item-top">
                          <strong>{title}</strong>
                          {c.lastMessage && <time>{relativeDay(c.lastMessage.at)}</time>}
                        </span>
                        <span className="thread-item-sub">
                          {c.other && <span className="relation">{c.other.relation === 'tutor' ? 'Tutor' : 'Student'}</span>}
                          <span className="thread-preview">{c.lastMessage ? `${c.lastMessage.fromMe ? 'You: ' : ''}${c.lastMessage.preview}` : 'No messages yet'}</span>
                        </span>
                      </span>
                      {c.unread > 0 && <span className="nav-badge" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="thread-pane" aria-label="Conversation">
          {selected ? (
            <ThreadView key={selected} id={selected} summary={current} onBack={() => select(null)} onChanged={() => void list.reload()} onRemoved={() => { select(null); void list.reload(); }} />
          ) : (
            <div className="thread-placeholder">
              <Icon name="message" size={28} />
              <p>Choose a conversation{!staffView && can('messages:send') ? ', or start a new one' : ''}.</p>
            </div>
          )}
        </section>
      </div>

      {starting && <NewMessage onClose={() => setStarting(false)} onPick={(c) => { setStarting(false); setParams({ with: c.userId, as: c.relation }); }} />}
    </div>
  );
}

function relativeDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(iso);
  const diff = (today.getTime() - d.getTime()) / 864e5;
  return diff < 6 ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---- one conversation ------------------------------------------------------------------

function ThreadView({ id, summary, onBack, onChanged, onRemoved }: { id: string; summary: ConversationSummary | null; onBack: () => void; onChanged: () => void; onRemoved: () => void }) {
  const { user, can } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const thread = useApi<Thread>(`/messages/conversations/${id}/messages`);
  const [older, setOlder] = useState<ThreadMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [reporting, setReporting] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastSeenId = useRef<string | null>(null);

  const t = thread.data;
  const isParticipant = !!t?.conversation.mySide;
  usePoll(() => void thread.reload(), THREAD_POLL_MS, isParticipant);

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return [...older, ...(t?.messages ?? [])].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }, [older, t]);

  // New messages: scroll to the bottom and mark the thread read.
  const newest = messages.at(-1);
  useEffect(() => {
    if (!newest || newest.id === lastSeenId.current) return;
    const first = lastSeenId.current === null;
    lastSeenId.current = newest.id;
    const el = scroller.current;
    if (el && (first || newest.fromMe || el.scrollHeight - el.scrollTop - el.clientHeight < 160)) el.scrollTop = el.scrollHeight;
    if (isParticipant && (first || !newest.fromMe)) {
      void api(`/messages/conversations/${id}/read`, { method: 'POST' }).then(() => { void refreshMessageSummary(); onChanged(); }).catch(() => undefined);
    }
  }, [newest, id, isParticipant, onChanged]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const page = await api<Thread>(`/messages/conversations/${id}/messages?before=${encodeURIComponent(first.createdAt)}`);
    setOlder((o) => [...page.messages, ...o]);
    setHasMoreOlder(page.hasMore);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await api(`/messages/conversations/${id}/messages`, { method: 'POST', json: { body, replyToId: replyTo?.id } });
      setDraft('');
      if (replyTo?.kind === 'QUESTION') toast('Answer sent');
      setReplyTo(null);
      await thread.reload();
      onChanged();
      void refreshMessageSummary();
      input.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  if (thread.loading && !t) return <Loading />;
  if (thread.error || !t) return <div className="thread-placeholder"><p>{thread.error ?? "We couldn't open this conversation."}</p></div>;

  const c = t.conversation;
  const other = c.other;
  const title = other?.name ?? `${c.student.name} ↔ ${c.tutor.name}`;
  const lastMine = [...messages].reverse().find((m) => m.fromMe);
  // "Seen" only under my own newest message, once the other person has read past it.
  const seen = !!(lastMine && newest?.id === lastMine.id && c.otherLastReadAt && c.otherLastReadAt >= lastMine.createdAt);
  const tz = user?.timezone;

  return (
    <div className="thread">
      <header className="thread-head">
        <button className="icon-btn thread-back" onClick={onBack} aria-label="Back to conversations"><Icon name="arrowLeft" /></button>
        <Avatar name={other?.name ?? c.student.name} size={36} />
        <div className="thread-head-text">
          <h2>{title}</h2>
          <small>{other ? (other.relation === 'tutor' ? 'Your tutor' : 'Your student') : `Student ${c.student.name} · Tutor ${c.tutor.name}`}</small>
        </div>
        {summary && summary.openQuestions > 0 && c.mySide === 'student' && <Pill tone="attention">{summary.openQuestions} question{summary.openQuestions > 1 ? 's' : ''} to answer</Pill>}
        {other?.relation === 'tutor' && <button className="link-btn subtle-link" onClick={() => setReporting(true)}>Report</button>}
        {c.mySide && (
          <button className="link-btn subtle-link" onClick={() => void api(`/messages/conversations/${id}/archive`, { method: 'POST', json: { archived: !summary?.archived } })
            .then(() => { toast(summary?.archived ? 'Moved back to your inbox' : 'Archived. A new message will bring it back.'); onRemoved(); })
            .catch((e) => toast(errorMessage(e)))}>{summary?.archived ? 'Move to inbox' : 'Archive'}</button>
        )}
        {can('messages:delete') && <button className="link-btn danger-link" onClick={() => setConfirmDelete(true)}>Delete</button>}
      </header>

      <div className="thread-body" ref={scroller}>
        {(hasMoreOlder ?? t.hasMore) && <div className="load-older"><button className="link-btn" onClick={() => void loadOlder()}>Show earlier messages</button></div>}
        {!messages.length && (
          <div className="thread-start">
            <p><strong>This is the start of your conversation with {other?.name ?? 'them'}.</strong></p>
            <p className="muted">Messages are private to the two of you. Administrators can review conversations to keep everyone safe.</p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          const grouped = !newDay && prev && prev.fromSide === m.fromSide && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && <div className="day-divider"><span>{fmtDate(m.createdAt, tz)}</span></div>}
              {m.kind === 'QUESTION' ? (
                <QuestionCard m={m} tz={tz} canAnswer={c.mySide === 'student' && !m.fromMe && !m.answeredAt} onAnswer={() => { setReplyTo(m); input.current?.focus(); }} />
              ) : (
                <div className={`bubble-row ${m.fromMe ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}>
                  <div className="bubble">
                    {m.replyTo && <div className="bubble-quote">{m.replyTo.preview}</div>}
                    <p>{m.body}</p>
                    <time dateTime={m.createdAt} title={fmtDateTime(m.createdAt, tz)}>{fmtTime(m.createdAt, tz)}</time>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {seen && <div className="seen">Seen</div>}
      </div>

      {isParticipant ? (
        other && !other.canReceive ? (
          <p className="thread-note">{other.name} can't receive messages right now (their account isn't active).</p>
        ) : (
          <form className="composer" onSubmit={send}>
            {replyTo && (
              <div className="composer-reply">
                <span><strong>{replyTo.kind === 'QUESTION' ? 'Answering' : 'Replying to'}:</strong> {replyTo.body.length > 120 ? `${replyTo.body.slice(0, 119)}…` : replyTo.body}</span>
                <button type="button" className="icon-btn" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><Icon name="x" size={16} /></button>
              </div>
            )}
            <div className="composer-row">
              <label className="sr-only" htmlFor="composer">Message</label>
              <textarea
                id="composer"
                ref={input}
                rows={Math.min(6, Math.max(1, draft.split('\n').length))}
                maxLength={MAX_LEN}
                placeholder={replyTo?.kind === 'QUESTION' ? 'Write your answer…' : `Message ${other?.name.split(' ')[0] ?? ''}…`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
              />
              <Button busy={sending} disabled={!draft.trim()} aria-label="Send" icon="send">Send</Button>
            </div>
            <div className="composer-foot">
              <span className="hint">Enter to send · Shift + Enter for a new line</span>
              {draft.length > MAX_LEN - 500 && <span className="hint">{MAX_LEN - draft.length} characters left</span>}
            </div>
            <ErrorText>{error}</ErrorText>
          </form>
        )
      ) : (
        <p className="thread-note">You're viewing this conversation as an administrator. You can't send messages in it.</p>
      )}
      {confirmDelete && (
        <ConfirmDialog title="Delete this conversation?" confirmLabel="Delete for everyone" danger onClose={() => setConfirmDelete(false)}
          onConfirm={async () => { await api(`/messages/conversations/${id}`, { method: 'DELETE' }); toast('Conversation deleted'); onRemoved(); }}>
          <p>All its messages are permanently removed for both people. This is recorded in the activity log and can't be undone.</p>
        </ConfirmDialog>
      )}
      {reporting && other && <ReportDialog tutor={{ id: other.id, name: other.name }} onClose={() => setReporting(false)} onDone={() => { setReporting(false); toast('Report sent to the team. Thank you for telling us.'); }} />}
    </div>
  );
}

function QuestionCard({ m, tz, canAnswer, onAnswer }: { m: ThreadMessage; tz?: string; canAnswer: boolean; onAnswer: () => void }) {
  return (
    <div className={`question-card ${m.fromMe ? 'mine' : ''}`}>
      <div className="question-head">
        <Icon name="help" size={16} />
        <span className="question-title">
          <strong>Question before the session</strong>
          {m.booking && <> · {m.booking.service}, {fmtDate(m.booking.startsAt, tz)} at {fmtTime(m.booking.startsAt, tz)}</>}
        </span>
        {m.answeredAt ? <Pill tone="good">Answered</Pill> : <Pill tone="attention">Waiting for an answer</Pill>}
      </div>
      <p>{m.body}</p>
      <div className="question-foot">
        <time dateTime={m.createdAt}>{fmtDateTime(m.createdAt, tz)}</time>
        {canAnswer && <Button variant="secondary" onClick={onAnswer}>Answer</Button>}
      </div>
    </div>
  );
}

// ---- start a conversation ----------------------------------------------------------------

function NewMessage({ onClose, onPick }: { onClose: () => void; onPick: (c: Contact) => void }) {
  const contacts = useApi<Contact[]>('/messages/contacts');
  const [q, setQ] = useState('');
  const shown = (contacts.data ?? []).filter((c) => `${c.name} ${c.subjects.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Modal title="New message" onClose={onClose}>
      <label className="field"><span>Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or subject" /></label>
      {contacts.loading && <Loading />}
      <ErrorText>{contacts.error}</ErrorText>
      {contacts.data && !shown.length && (
        <Empty title={q ? 'No matches' : 'Nobody to message yet'}>
          {q ? 'Try another name or subject.' : 'Once you book a session, or a tutor is assigned to a subject, they appear here.'}
        </Empty>
      )}
      <ul className="contact-list">
        {shown.map((c) => (
          <li key={`${c.relation}:${c.userId}`}>
            <button className="contact" onClick={() => onPick(c)}>
              <Avatar name={c.name} size={34} />
              <span>
                <strong>{c.name}</strong>
                <small>{c.relation === 'tutor' ? `Tutor${c.subjects.length ? ` · ${c.subjects.join(', ')}` : ''}` : 'Your student'}</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
