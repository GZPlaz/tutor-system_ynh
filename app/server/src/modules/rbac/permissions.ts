/**
 * PERMISSION CATALOG — the single source of truth for what can be granted.
 *
 * How to add a capability to the platform:
 *   1. Add an entry below (key format "resource:action").
 *   2. Guard the route with `requirePermission(P.YOUR_KEY)`.
 *   3. Restart the API. `syncRbac()` upserts the new permission into the DB,
 *      grants it to the admin role, and it appears in the role editor UI.
 *
 * "_own" vs "_any": the "_own" variant lets a user act on records they own
 * (their bookings, their resources); the "_any" variant is an override for
 * staff. Services check ownership; the middleware only checks the key.
 */
export const PERMISSIONS = {
  // Users & approvals
  USERS_READ: { key: 'users:read', category: 'Users', description: 'View user directory and profiles' },
  USERS_MANAGE: { key: 'users:manage', category: 'Users', description: 'Create, edit, suspend users and assign roles' },
  USERS_APPROVE: { key: 'users:approve', category: 'Users', description: 'Approve or reject pending registrations' },
  USERS_DELETE: { key: 'users:delete', category: 'Users', description: 'Delete accounts' },

  // RBAC
  ROLES_MANAGE: { key: 'roles:manage', category: 'Access control', description: 'Create custom roles and edit their permissions' },

  // Scheduling
  SERVICES_MANAGE: { key: 'services:manage', category: 'Scheduling', description: 'Create, edit and delete bookable services' },
  AVAILABILITY_MANAGE_OWN: { key: 'availability:manage_own', category: 'Scheduling', description: 'Set own availability blocks' },
  AVAILABILITY_MANAGE_ANY: { key: 'availability:manage_any', category: 'Scheduling', description: "Edit any tutor's availability" },
  BOOKINGS_CREATE: { key: 'bookings:create', category: 'Scheduling', description: 'Book sessions' },
  BOOKINGS_READ_OWN: { key: 'bookings:read_own', category: 'Scheduling', description: 'View own bookings (as student or tutor)' },
  BOOKINGS_READ_ANY: { key: 'bookings:read_any', category: 'Scheduling', description: 'View all bookings' },
  BOOKINGS_CANCEL_OWN: { key: 'bookings:cancel_own', category: 'Scheduling', description: 'Cancel own bookings (subject to cutoff)' },
  BOOKINGS_MANAGE_ANY: { key: 'bookings:manage_any', category: 'Scheduling', description: 'Create/cancel/modify any booking, ignore cutoffs' },

  // Session feed
  SESSIONS_VIEW_FEED: { key: 'sessions:view_feed', category: 'Sessions', description: 'View the session feed for own sessions' },
  SESSIONS_POST_LINK: { key: 'sessions:post_link', category: 'Sessions', description: 'Post Google Meet links and notes to own sessions' },
  SESSIONS_RUN: { key: 'sessions:run', category: 'Sessions', description: 'Confirm or decline booking requests, start and end own sessions' },

  // Resources & classes
  RESOURCES_READ_ASSIGNED: { key: 'resources:read_assigned', category: 'Resources', description: 'View resources assigned to me or my classes' },
  RESOURCES_CREATE: { key: 'resources:create', category: 'Resources', description: 'Upload and organise resources' },
  RESOURCES_ASSIGN: { key: 'resources:assign', category: 'Resources', description: 'Assign own resources to students/classes' },
  RESOURCES_MANAGE_ANY: { key: 'resources:manage_any', category: 'Resources', description: 'Manage every resource' },
  GROUPS_MANAGE: { key: 'groups:manage', category: 'Resources', description: 'Create classes and manage membership' },

  // Platform
  AUDIT_READ: { key: 'audit:read', category: 'Platform', description: 'Read the audit log' },
  SETTINGS_MANAGE: { key: 'settings:manage', category: 'Platform', description: "Change site settings (sign-ups, booking rules, maintenance) and branding" },
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['key'];

/** Shorthand used in route files: requirePermission(P.BOOKINGS_CREATE). */
export const P = Object.fromEntries(
  Object.entries(PERMISSIONS).map(([name, def]) => [name, def.key]),
) as { [K in keyof typeof PERMISSIONS]: (typeof PERMISSIONS)[K]['key'] };

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS).map((p) => p.key) as PermissionKey[];

/**
 * System roles and their DEFAULT permissions. On first boot these are
 * created; afterwards admins can edit tutor/student permissions freely and
 * syncRbac() will not overwrite their changes (admin always gets everything).
 */
export const SYSTEM_ROLES = {
  admin: {
    name: 'Administrator',
    description: 'Full access to every module.',
    permissions: ALL_PERMISSION_KEYS,
  },
  tutor: {
    name: 'Tutor',
    description: 'Teaches sessions, manages own availability and resources.',
    permissions: [
      P.AVAILABILITY_MANAGE_OWN,
      P.BOOKINGS_READ_OWN,
      P.BOOKINGS_CANCEL_OWN,
      P.SESSIONS_VIEW_FEED,
      P.SESSIONS_POST_LINK,
      P.SESSIONS_RUN,
      P.RESOURCES_CREATE,
      P.RESOURCES_ASSIGN,
      P.RESOURCES_READ_ASSIGNED,
      P.GROUPS_MANAGE,
      P.USERS_READ,
    ],
  },
  student: {
    name: 'Student',
    description: 'Books sessions, joins via the session feed, reads assigned resources.',
    permissions: [
      P.BOOKINGS_CREATE,
      P.BOOKINGS_READ_OWN,
      P.BOOKINGS_CANCEL_OWN,
      P.SESSIONS_VIEW_FEED,
      P.RESOURCES_READ_ASSIGNED,
    ],
  },
} as const satisfies Record<string, { name: string; description: string; permissions: readonly PermissionKey[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

/** Role given to anyone who self-registers through the public sign-up form. */
export const SELF_REGISTRATION_ROLE: SystemRoleKey = 'student';
