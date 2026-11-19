/**
 * Input validation with zod. Every route that accepts input declares a schema:
 *
 *   router.post('/x', validate({ body: CreateXSchema }), (req) => {
 *     const body = req.valid.body as z.infer<typeof CreateXSchema>;
 *   });
 *
 * Use the `parsed()` helper below for typed access. Unknown keys are stripped
 * (zod's default), so clients cannot smuggle extra fields into Prisma calls.
 */
import type { RequestHandler, Request } from 'express';
import type { z, ZodType } from 'zod';
import { AppError } from '../lib/errors.js';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    req.valid ??= {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        throw new AppError(
          422,
          'VALIDATION_FAILED',
          'Some fields are invalid',
          result.error.issues.map((i) => ({ field: [part, ...i.path].join('.'), message: i.message })),
        );
      }
      // Express 5 makes req.query read-only, so parsed values live on req.valid.
      req.valid[part] = result.data;
    }
    next();
  };
}

/** Typed accessor: `const body = parsed(req, 'body', CreateXSchema)`. */
export function parsed<S extends ZodType>(req: Request, part: keyof Schemas, _schema: S): z.infer<S> {
  return req.valid[part] as z.infer<S>;
}
