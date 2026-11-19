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
  actions: SessionActions;
  posts: { id: string; kind: string; message: string | null; author: string; createdAt: string }[];
}


export const fullName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : '');
