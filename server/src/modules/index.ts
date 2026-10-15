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
import { billingRouter } from './billing/billing.routes.js';
import { auditRouter } from './audit/audit.routes.js';

export const modules: { path: string; router: Router }[] = [
  { path: '/auth', router: authRouter },
  { path: '/users', router: usersRouter },
  { path: '/rbac', router: rbacRouter },
  { path: '/scheduling', router: schedulingRouter },
  { path: '/sessions', router: sessionsRouter },
  { path: '/resources', router: resourcesRouter },
  { path: '/groups', router: groupsRouter },
  { path: '/billing', router: billingRouter },
  { path: '/audit', router: auditRouter },
];
