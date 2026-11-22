/**
 * MODULE REGISTRY — the one place that wires feature modules into the API.
 *
 * Adding a feature: create src/modules/<name>/ with a routes file that
 * exports a Router, then add one line here. Removing a feature is the reverse.
 * Each module owns its routes, service, validation schemas and permissions.
 */
import type { Router } from 'express';
import { authRouter } from './auth/auth.routes.js';
import { usersRouter } from './users/users.routes.js';
import { rbacRouter } from './rbac/rbac.routes.js';
import { schedulingRouter } from './scheduling/scheduling.routes.js';
import { sessionsRouter } from './sessions/sessions.routes.js';
import { groupsRouter, resourcesRouter } from './resources/resources.routes.js';
import { auditRouter } from './audit/audit.routes.js';
import { brandingRouter, settingsRouter } from './settings/settings.routes.js';
import { publicRouter } from './public/public.routes.js';
import { packetsRouter, publicPacketsRouter } from './packets/packets.routes.js';
import { messagesRouter } from './messages/messages.routes.js';

export const modules: { path: string; router: Router }[] = [
  { path: '/auth', router: authRouter },
  { path: '/users', router: usersRouter },
  { path: '/rbac', router: rbacRouter },
  { path: '/scheduling', router: schedulingRouter },
  { path: '/sessions', router: sessionsRouter },
  { path: '/resources', router: resourcesRouter },
  { path: '/groups', router: groupsRouter },
  { path: '/audit', router: auditRouter },
  { path: '/branding', router: brandingRouter },
  { path: '/settings', router: settingsRouter },
  { path: '/messages', router: messagesRouter },
  { path: '/packets', router: packetsRouter },
  // Before '/public' so the free packets are reachable even when guest booking is off.
  { path: '/public/packets', router: publicPacketsRouter },
  { path: '/public', router: publicRouter },
];
