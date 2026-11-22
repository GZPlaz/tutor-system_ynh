/**
 * /api/students
 *   GET    /me/notes                    shared notes about me (any signed-in person)
 *   GET    /?scope=mine|all&search      students I teach (all: with users:read)
 *   GET    /:id                         profile, notes, sessions
 *   POST   /:id/notes                   { body, visibility }
 *   PATCH  /notes/:noteId               { body?, visibility? }
 *   DELETE /notes/:noteId
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { P } from '../rbac/permissions.js';
import * as svc from './students.service.js';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

const Uuid = z.string().uuid();
const Visibility = z.enum(['SHARED', 'TUTORS_ONLY']);
const NoteBody = z.string().trim().min(1, 'Write the note first').max(4000);

studentsRouter.get('/me/notes', async (req, res) => {
  res.json(await svc.myNotes(authOf(req)));
});

const ListQuery = z.object({ scope: z.enum(['mine', 'all']).default('mine'), search: z.string().trim().max(100).optional() });
studentsRouter.get('/', requirePermission(P.STUDENT_NOTES_READ), validate({ query: ListQuery }), async (req, res) => {
  res.json(await svc.listStudents(authOf(req), parsed(req, 'query', ListQuery)));
});

studentsRouter.get('/:id', requirePermission(P.STUDENT_NOTES_READ), validate({ params: z.object({ id: Uuid }) }), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await svc.studentProfile(authOf(req), (req.valid.params as { id: string }).id));
});

const CreateBody = z.object({ body: NoteBody, visibility: Visibility });
studentsRouter.post('/:id/notes', requirePermission(P.STUDENT_NOTES_WRITE), validate({ params: z.object({ id: Uuid }), body: CreateBody }), async (req, res) => {
  res.status(201).json(await svc.addNote(authOf(req), (req.valid.params as { id: string }).id, parsed(req, 'body', CreateBody)));
});

const UpdateBody = z.object({ body: NoteBody.optional(), visibility: Visibility.optional() });
studentsRouter.patch('/notes/:noteId', requirePermission(P.STUDENT_NOTES_WRITE), validate({ params: z.object({ noteId: Uuid }), body: UpdateBody }), async (req, res) => {
  res.json(await svc.updateNote(authOf(req), (req.valid.params as { noteId: string }).noteId, parsed(req, 'body', UpdateBody)));
});

studentsRouter.delete('/notes/:noteId', requirePermission(P.STUDENT_NOTES_WRITE), validate({ params: z.object({ noteId: Uuid }) }), async (req, res) => {
  await svc.deleteNote(authOf(req), (req.valid.params as { noteId: string }).noteId);
  res.status(204).end();
});
