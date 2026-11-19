/**
 * Extends Express' Request with what our middleware attaches.
 *  - req.auth:  set by `authenticate` (who is calling + what they may do)
 *  - req.valid: set by `validate` (zod-parsed, typed body/query/params)
 */
import 'express';

declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
      email: string;
      timezone: string;
      roles: string[];
      permissions: Set<string>;
      /** Convenience: does the caller hold this permission? */
      can(permission: string): boolean;
    }

    interface Request {
      auth?: AuthContext;
      valid: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
