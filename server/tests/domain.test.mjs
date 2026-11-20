import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceLabel, priorityLabel, priorityScore, summarize, summarizeTopic } from '../src/domain/priority.mjs';
import { HELPER_MIN_SEMESTER, isValidSemester, yearLabel } from '../src/domain/academic.mjs';
import { validateYears } from '../src/domain/years.mjs';
import { computeStreak } from '../src/domain/streak.mjs';
import { hashPassword, verifyPassword } from '../src/lib/crypto.mjs';
import { loadConfig } from '../src/config.mjs';

const r = (importance, exam, interview, difficulty = 3) => ({ importance, exam, interview, difficulty });
test('priority formula: bounds, example, difficulty and confidence do not change the score', () => {
  assert.equal(priorityScore(r(1, 1, 1)), 0); assert.equal(priorityScore(r(5, 5, 5)), 100); assert.equal(priorityScore(r(5, 4, 5)), 92); assert.equal(priorityScore(r(4, 3, 2, 1)), priorityScore(r(4, 3, 2, 5)));
  assert.equal(summarize([r(5, 4, 5)]).priorityScore, summarize(Array.from({ length: 9 }, () => r(5, 4, 5))).priorityScore); assert.throws(() => priorityScore(r(0, 3, 3))); assert.throws(() => summarize([r(3.5, 3, 3)]));
});
test('labels, confidence, empty and senior-only summaries', () => {
  assert.deepEqual([100, 85, 84, 70, 69, 50, 49, 0].map(priorityLabel), ['Must Study', 'Must Study', 'High Priority', 'High Priority', 'Medium', 'Medium', 'Low', 'Low']);
  assert.deepEqual([0, 1, 2, 3, 5, 6, 40].map(confidenceLabel), ['No ratings yet', 'Limited data', 'Limited data', 'Early signal', 'Early signal', 'Broader community signal', 'Broader community signal']);
  const e = summarize([]); assert.equal(e.priorityScore, null); assert.equal(e.message, 'No ratings yet'); const t = summarizeTopic([{ ...r(5, 5, 5), level: 'JUNIOR' }]); assert.equal(t.senior.message, 'No senior ratings yet.');
  const grouped = summarizeTopic([{ ...r(5, 5, 5), level: 'SENIOR' }, { ...r(1, 1, 1), level: 'JUNIOR' }, { ...r(4, 4, 4), level: 'CANDIDATE' }]);
  assert.equal(grouped.senior.priorityScore, 100); assert.equal(grouped.junior.priorityScore, 0); assert.equal(grouped.candidate.sampleCount, 1);
});
test('semester validation, helper eligibility threshold, academic year labels and streak rules', () => {
  assert.equal(HELPER_MIN_SEMESTER, 3);
  for (const s of [1, 3, 4, 8]) assert.equal(isValidSemester(s), true); for (const s of [0, 9, -1, 2.5, NaN]) assert.equal(isValidSemester(s), false);
  assert.deepEqual([1, 3, 5, 7, 9].map(yearLabel), ['First Year', 'Second Year', 'Third Year', 'Final Year', 'Final Year']); // academic year is derived from semester; Junior/Senior/Candidate is a separate user-selected field
  assert.deepEqual(validateYears({ enrollmentYear: 2024, graduationYear: 2028, currentSemester: 3 }, 2026), {}); assert.ok(validateYears({ enrollmentYear: 2024, graduationYear: 2023, currentSemester: 3 }, 2026).graduationYear); assert.ok(validateYears({ enrollmentYear: 2026, graduationYear: 2030, currentSemester: 7 }, 2026).currentSemester);
  assert.equal(computeStreak([], '2026-10-10'), 0); assert.equal(computeStreak(['2026-10-10', '2026-10-09', '2026-10-08'], '2026-10-10'), 3); assert.equal(computeStreak(['2026-10-09', '2026-10-08'], '2026-10-10'), 2); assert.equal(computeStreak(['2026-10-10', '2026-10-08'], '2026-10-10'), 1); assert.equal(computeStreak(['2026-10-07'], '2026-10-10'), 0);
});
test('passwords are hashed with salt and verified; configuration fails fast', async () => {
  const a = await hashPassword('correct horse battery'); const b = await hashPassword('correct horse battery'); assert.notEqual(a, b); assert.ok(await verifyPassword(a, 'correct horse battery')); assert.equal(await verifyPassword(a, 'wrong'), false); assert.equal(await verifyPassword('garbage', 'x'), false);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://app.example.com' }), /SESSION_SECRET/); assert.throws(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), FRONTEND_ORIGIN: 'http://app.example.com' }), /https/); assert.throws(() => loadConfig({ SESSION_SECRET: 'short' , FRONTEND_ORIGIN: 'http://localhost:5173' }, { dbPath: ':memory:' }), /32/);
  assert.equal(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), FRONTEND_ORIGIN: 'https://app.example.com' }).cookieSecure, true);
});
