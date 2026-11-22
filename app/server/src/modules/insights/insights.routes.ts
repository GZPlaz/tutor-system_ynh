/**
 * /api/insights  (reports:read)
 *   GET /?weeks=12              overview: totals, weekly series, subjects, tutors, recent feedback
 *   GET /export/sessions.csv?from&to   one row per session (default: last 90 days)
 *   GET /export/people.csv      one row per account
 * Exports are written to the activity log.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import * as svc from './insights.service.js';

export const insightsRouter = Router();
insightsRouter.use(authenticate, requirePermission(P.REPORTS_READ));

const OverviewQuery = z.object({ weeks: z.coerce.number().int().min(4).max(52).default(12) });
insightsRouter.get('/', validate({ query: OverviewQuery }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.overview(parsed(req, 'query', OverviewQuery).weeks));
});

const sendCsv = (res: import('express').Response, filename: string, csv: string) => {
  res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
};

const RangeQuery = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });
insightsRouter.get('/export/sessions.csv', validate({ query: RangeQuery }), async (req, res) => {
  const q = parsed(req, 'query', RangeQuery);
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 90 * 864e5);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  sendCsv(res, `sessions-${day(from)}-to-${day(to)}.csv`, await svc.sessionsCsv(authOf(req), from, to));
});

insightsRouter.get('/export/people.csv', async (req, res) => {
  sendCsv(res, `people-${new Date().toISOString().slice(0, 10)}.csv`, await svc.peopleCsv(authOf(req)));
});
