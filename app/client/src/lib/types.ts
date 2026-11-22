/** Shapes returned by the API (kept in one place so pages agree). */

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'DECLINED';

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  timezone?: string;
}

export interface UserRow extends PersonRef {
  email: string;
  timezone: string;
  status: UserStatus;
  createdAt: string;
  approvedAt: string | null;
  lastLoginAt: string | null;
  roles: { key: string; name: string }[];
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
  tutors: { tutor: PersonRef }[];
}

export interface Booking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  studentNotes: string | null;
  meetingUrl: string | null;
  cancelReason: string | null;
  service: { id: string; name: string; durationMinutes: number };
  student: PersonRef;
  tutor: PersonRef;
}

export interface AvailabilityRule {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
}

export interface AvailabilityException {
  id: string;
  startsAt: string;
  endsAt: string;
  isAvailable: boolean;
  reason: string | null;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  members: { user: PersonRef }[];
}

export interface Resource {
  id: string;
  title: string;
  description: string | null;
  type: 'FILE' | 'LINK' | 'VIDEO';
  folder: string | null;
  tags: string[];
  url: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  owner: { firstName: string; lastName: string };
  assignments: {
    id: string;
    dueAt: string | null;
    student: PersonRef | null;
    group: { id: string; name: string } | null;
  }[];
}

/** A free study packet as shown on the public /packets page. */
export interface PublicPacket {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  pageCount: number | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
}

/** The admin view of a packet (Admin → Study packets). */
export interface StudyPacket extends PublicPacket {
  isPublished: boolean;
  sortOrder: number;
  downloadCount: number;
  seedKey: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

export interface PublicConfig {
  bookingMinLeadHours: number;
  bookingMaxHorizonDays: number;
  studentCancelCutoffHours: number;
  uploadMaxMb: number;
  /** Can visitors create their own account? */
  registrationOpen: boolean;
  /** New accounts wait for an administrator's approval. */
  registrationNeedsApproval: boolean;
  /** If not empty, sign-up is limited to these email domains. */
  allowedEmailDomains: string[];
  /** Visitors can book with just a name and email. */
  guestBooking: boolean;
  /** Set while the site is in maintenance mode. */
  maintenance: { message: string } | null;
  /** Operator details for the legal pages (Admin → Settings → Legal). */
  legal: LegalInfo;
}

/** Admin → Settings (GET/PUT /api/settings). */
export interface AppSettings {
  registration: { open: boolean; requireApproval: boolean; allowedEmailDomains: string[]; notifyAdmins: boolean };
  booking: {
    requireAccount: boolean;
    minLeadHours: number;
    maxHorizonDays: number;
    slotStepMinutes: number;
    studentCancelCutoffHours: number;
    meetingLinkNudgeMinutes: number;
  };
  maintenance: { enabled: boolean; message: string };
  legal: LegalInfo;
}

/** A guest's own booking (GET /api/public/bookings/:id?t=…). */
export interface GuestBooking {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  firstName: string;
  service: { name: string; durationMinutes: number };
  tutorName: string;
  notes: string | null;
  cancelReason: string | null;
  meetingUrl: string | null;
  canCancel: boolean;
  cancelTooLate: boolean;
  cancelCutoffHours: number;
}

/** What the server says the current user may do with a session (bookingRules.ts). */
export interface SessionActions {
  confirm: boolean;
  decline: boolean;
  start: boolean;
  end: boolean;
  noShow: boolean;
  postLink: boolean;
  cancel: boolean;
  cancelTooLate: boolean;
}


export interface Session {
  id: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  confirmedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  isLive: boolean;
  myRole: 'tutor' | 'student' | 'staff';
  student: { id: string; name: string };
  tutor: { id: string; name: string };
  notes: string | null;
  reason: string | null;
  meetingUrl: string | null;
  recap: string | null;
  recapPostedAt: string | null;
  feedback: { rating: number; comment: string | null; updatedAt: string } | null;
  canRecap: boolean;
  canRate: boolean;
  actions: SessionActions;
  posts: { id: string; kind: string; message: string | null; author: string; createdAt: string }[];
}


export const fullName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : '');

// ---- messaging ---------------------------------------------------------------------

export type Relation = 'tutor' | 'student';

export interface Contact {
  userId: string;
  name: string;
  relation: Relation;
  subjects: string[];
}

export interface ConversationSummary {
  id: string;
  /** null when staff are viewing someone else's thread */
  mySide: Relation | null;
  other: { id: string; name: string; relation: Relation } | null;
  student: { id: string; name: string };
  tutor: { id: string; name: string };
  lastMessage: { preview: string; at: string; fromMe: boolean; kind: 'MESSAGE' | 'QUESTION' } | null;
  lastMessageAt: string;
  unread: number;
  openQuestions: number;
  archived: boolean;
}

export interface ThreadMessage {
  id: string;
  kind: 'MESSAGE' | 'QUESTION';
  body: string;
  createdAt: string;
  answeredAt: string | null;
  fromMe: boolean;
  fromSide: Relation;
  replyTo: { id: string; preview: string } | null;
  booking: { id: string; startsAt: string; status: BookingStatus; service: string } | null;
}

export interface Thread {
  conversation: {
    id: string;
    mySide: Relation | null;
    student: { id: string; name: string };
    tutor: { id: string; name: string };
    other: { id: string; name: string; relation: Relation; canReceive: boolean } | null;
    otherLastReadAt: string | null;
  };
  messages: ThreadMessage[];
  hasMore: boolean;
}

export interface MessageSummary {
  unread: number;
  openQuestions: { messageId: string; conversationId: string; tutorName: string; bookingId: string | null; service: string | null; startsAt: string | null }[];
}

// ---- insights ------------------------------------------------------------------------

export interface Insights {
  period: { from: string; to: string; weeks: number };
  totals: {
    completed: number; upcoming: number; missedRate: number | null; cancelRate: number | null;
    averageRating: number | null; ratings: number; newPeople: number; activeStudents: number; messages: number; packetDownloads: number;
  };
  weekly: { weekStart: string; completed: number; missed: number; cancelled: number }[];
  subjects: { service: string; completed: number; booked: number }[];
  tutors: { tutor: string; completed: number; missed: number; rating: number | null; ratings: number }[];
  recentFeedback: { rating: number; comment: string; at: string; service: string; tutor: string; sessionAt: string }[];
}

export interface LegalInfo {
  operatorName: string;
  contactEmail: string;
  postalAddress: string;
  governingLaw: string;
  minimumAge: number;
  parentalConsentAge: number;
  effectiveDate: string;
  termsVersion: string;
  additionalTerms: string;
}
