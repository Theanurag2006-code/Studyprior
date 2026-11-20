import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
/** .strict() rejects unknown keys, so clients cannot send accountRole or academicLevel at all. */
export const registerSchema = z.object({
  name: text(2, 80), email, password: z.string().min(10, 'Use at least 10 characters').max(128),
  department: text(2, 120), branch: text(2, 120).optional(), college: text(2, 160), enrollmentNumber: text(1, 40).optional(),
  enrollmentYear: z.number().int(), graduationYear: z.number().int(), currentSemester: z.number().int(),
}).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const profileUpdateSchema = z.object({
  name: text(2, 80), college: text(2, 160), department: text(2, 120), branch: text(2, 120).nullable(), enrollmentNumber: text(1, 40).nullable(),
  enrollmentYear: z.number().int(), graduationYear: z.number().int(), bio: z.string().trim().max(300),
  profilePhotoUrl: z.string().url().startsWith('https://').max(500).nullable(), availableForQuestions: z.boolean(), publicContributions: z.boolean(),
  themePreference: z.enum(['LIGHT', 'DARK', 'SYSTEM']),
}).partial().strict().refine(o => Object.keys(o).length > 0, 'Provide at least one field to update');
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
