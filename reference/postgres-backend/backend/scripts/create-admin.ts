/**
 * Creates the first ADMIN account. This is the ONLY way to make an admin (public registration cannot).
 * Usage (values come from the environment so they never land in shell history or git):
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-passphrase' npm run admin:create
 */
import { z } from 'zod';
import { loadEnv } from '../src/config/env';
import { createPrisma } from '../src/db/prisma';
import { hashPassword } from '../src/lib/crypto';

async function main() {
  const env = loadEnv();
  const v = z.object({ ADMIN_EMAIL: z.string().trim().toLowerCase().email(), ADMIN_NAME: z.string().trim().min(2).max(80), ADMIN_PASSWORD: z.string().min(12).max(128) }).safeParse(process.env);
  if (!v.success) { console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (12+ characters).'); process.exit(1); }
  const prisma = createPrisma(env.databaseUrl);
  try {
    if (await prisma.user.findUnique({ where: { email: v.data.ADMIN_EMAIL } })) { console.error('A user with that email already exists. Nothing was changed.'); process.exit(1); }
    await prisma.user.create({ data: { name: v.data.ADMIN_NAME, email: v.data.ADMIN_EMAIL, passwordHash: await hashPassword(v.data.ADMIN_PASSWORD), accountRole: 'ADMIN',
      department: 'Administration', college: 'StudyPrior' } }); // administrators are not students: no semester, years or Junior/Senior level
    console.log(`Admin created: ${v.data.ADMIN_EMAIL}`);
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error('Failed:', e instanceof Error ? e.name : 'error'); process.exit(1); });
