/** Shapes returned by the API (kept in one place so pages agree). */

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

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
  priceCents: number | null;
  currency: string;
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
  billingEnabled: boolean;
  bookingMinLeadHours: number;
  bookingMaxHorizonDays: number;
  studentCancelCutoffHours: number;
  meetingLinkWindowMin: number;
  uploadMaxMb: number;
}

export const fullName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : '');
