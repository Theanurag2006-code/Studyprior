import { Prisma, type PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { deriveAcademicLevel, isValidSemester } from '../domain/academic';
import { validateYears } from '../domain/years';
import { dummyVerify, hashPassword, verifyPassword } from '../lib/crypto';
import { AppError, validationError, type FieldIssue } from '../lib/errors';
import type { LoginInput, ProfileUpdate, RegisterInput } from '../schemas/auth';
import { getAcademicSettings } from './academic';
import { createSession } from './sessions';
import { toUserDto } from './users';

const issues = (m: Record<string, string>): FieldIssue[] => Object.entries(m).map(([field, message]) => ({ field, message }));

export async function register(prisma: PrismaClient, env: Env, input: RegisterInput, userAgent?: string) {
  const settings = await getAcademicSettings(prisma); const errs: Record<string, string> = {};
  if (!isValidSemester(input.currentSemester, settings)) errs.currentSemester = `currentSemester must be an integer from 1 to ${settings.maxSemester}`;
  Object.assign(errs, { ...validateYears(input), ...errs });
  if (Object.keys(errs).length) throw validationError(issues(errs));
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({ data: {
      name: input.name, email: input.email, passwordHash, department: input.department, branch: input.branch, college: input.college, enrollmentNumber: input.enrollmentNumber,
      enrollmentYear: input.enrollmentYear, graduationYear: input.graduationYear, currentSemester: input.currentSemester,
      accountRole: 'STUDENT', // fixed here: public registration can never create an admin
      academicLevel: deriveAcademicLevel(input.currentSemester, settings), // always derived on the server
    } });
    const session = await createSession(prisma, env, user.id, userAgent);
    return { user: toUserDto(user), session };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    throw e;
  }
}

export async function login(prisma: PrismaClient, env: Env, input: LoginInput, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = user ? await verifyPassword(user.passwordHash, input.password) : (await dummyVerify(input.password), false);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.'); // same answer for unknown email and wrong password
  await prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  return { user: toUserDto(user), session: await createSession(prisma, env, user.id, userAgent) };
}

export const logout = (prisma: PrismaClient, sessionId: string) => prisma.session.deleteMany({ where: { id: sessionId } });

export async function updateProfile(prisma: PrismaClient, userId: string, input: ProfileUpdate) {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (current.accountRole === 'ADMIN') { // administrators have no academic status
    const bad = (['enrollmentYear', 'graduationYear'] as const).filter(k => input[k] !== undefined);
    if (bad.length) throw validationError(bad.map(field => ({ field, message: 'Not applicable to administrator accounts' })));
  } else { // students always have these values (database CHECK ck_users_role_academic)
    const errs = validateYears({ enrollmentYear: input.enrollmentYear ?? current.enrollmentYear!, graduationYear: input.graduationYear ?? current.graduationYear!, currentSemester: current.currentSemester! });
    if (Object.keys(errs).length) throw validationError(issues(errs));
  }
  // Role, level, semester, email and password are not part of ProfileUpdate, so they cannot be changed here.
  return toUserDto(await prisma.user.update({ where: { id: userId }, data: input }));
}
