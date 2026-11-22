import { z } from 'zod';
import { isValidTimeZone } from '../../lib/time.js';

/** 10+ chars with at least one letter and one digit. Length matters most. */
export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254);

export const TimezoneSchema = z.string().refine(isValidTimeZone, 'Unknown timezone');

/**
 * Agreement to the Terms of Service and Privacy Policy, required to sign up or book.
 * `age` is "adult" (old enough to agree alone) or "guardian" (a parent or guardian
 * agrees on the person's behalf).
 */
export const ConsentFields = {
  acceptTerms: z.literal(true, { message: 'Please agree to the Terms of Service and Privacy Policy' }),
  age: z.enum(['adult', 'guardian'], { message: 'Please confirm your age or guardian consent' }),
};

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  timezone: TimezoneSchema.default('UTC'),
  ...ConsentFields,
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});

export const ForgotPasswordSchema = z.object({ email: EmailSchema });

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  timezone: TimezoneSchema.optional(),
  emailOnMessage: z.boolean().optional(),
  emailReminders: z.boolean().optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});
