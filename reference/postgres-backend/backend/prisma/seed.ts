/**
 * DEVELOPMENT SEED: fictional fixtures for local work only. Refuses to run in production.
 * Repeatable: everything is upserted by its natural key, so running it twice creates no duplicates.
 * Requires SEED_USER_PASSWORD (10+ chars) so no password is stored in the repository.
 */
import { loadEnv } from '../src/config/env';
import { createPrisma } from '../src/db/prisma';
import { deriveAcademicLevel } from '../src/domain/academic';
import { hashPassword } from '../src/lib/crypto';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const CATALOG = [
  { name: 'Data Structures', department: 'Computer Science', semester: 3, code: 'CS201', units: [['Linear Structures', ['Arrays and Linked Lists', 'Stacks and Queues']], ['Trees and Graphs', ['Binary Trees', 'Graph Traversal']]] },
  { name: 'Database Management', department: 'Computer Science', semester: 3, code: 'CS202', units: [['Relational Model', ['SQL Joins', 'Normalization']], ['Transactions', ['ACID and Isolation']]] },
  { name: 'Operating Systems', department: 'Computer Science', semester: 5, code: 'CS301', units: [['Processes', ['CPU Scheduling', 'Deadlocks']]] },
] as const;

async function main() {
  const env = loadEnv();
  if (env.isProduction) { console.error('Refusing to seed development data in production.'); process.exit(1); }
  const password = process.env.SEED_USER_PASSWORD; if (!password || password.length < 10) { console.error('Set SEED_USER_PASSWORD (10+ characters) to seed development accounts.'); process.exit(1); }
  const prisma = createPrisma(env.databaseUrl); const hash = await hashPassword(password); const year = new Date().getUTCFullYear();
  try {
    const people = [{ name: 'Dev Junior (fixture)', email: 'dev.junior@studyprior.test', semester: 3 }, { name: 'Dev Senior (fixture)', email: 'dev.senior@studyprior.test', semester: 6 }];
    const users = [];
    for (const p of people) users.push(await prisma.user.upsert({ where: { email: p.email }, update: {}, create: { name: p.name, email: p.email, passwordHash: hash, department: 'Computer Science', college: 'Development University (fixture)',
      enrollmentYear: year - 2, graduationYear: year + 2, currentSemester: p.semester, academicLevel: deriveAcademicLevel(p.semester) } }));
    for (const s of CATALOG) {
      const subject = await prisma.subject.upsert({ where: { nameNormalized_department_semester: { nameNormalized: norm(s.name), department: s.department, semester: s.semester } }, update: {},
        create: { name: s.name, nameNormalized: norm(s.name), department: s.department, semester: s.semester, code: s.code, description: 'Development fixture subject.' } });
      let n = 0;
      for (const [uName, topics] of s.units) {
        n++; const unit = await prisma.unit.upsert({ where: { subjectId_unitNumber: { subjectId: subject.id, unitNumber: n } }, update: {}, create: { subjectId: subject.id, name: uName, nameNormalized: norm(uName), unitNumber: n } });
        for (const t of topics) await prisma.topic.upsert({ where: { subjectId_nameNormalized: { subjectId: subject.id, nameNormalized: norm(t) } }, update: {}, create: { subjectId: subject.id, unitId: unit.id, name: t, nameNormalized: norm(t) } });
      }
    }
    // A few clearly fictional ratings so the dev UI has something to show. Never seeded in production.
    const first = await prisma.topic.findFirstOrThrow({ where: { nameNormalized: 'binary trees' } });
    for (const [u, vals] of [[users[0], [4, 4, 4, 3]], [users[1], [5, 4, 5, 4]]] as const) await prisma.rating.upsert({ where: { userId_topicId: { userId: u.id, topicId: first.id } }, update: {},
      create: { userId: u.id, topicId: first.id, importance: vals[0], difficulty: vals[1], examRelevance: vals[2], interviewRelevance: vals[3], advice: 'Development fixture advice.', academicLevelAtSubmission: u.academicLevel } });
    console.log('Development seed complete (fictional fixtures).');
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error('Seed failed:', e instanceof Error ? e.name : 'error'); process.exit(1); });
