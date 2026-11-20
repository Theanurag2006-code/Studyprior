import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, makeAdmin, signUp, start, subjectBody } from './helpers.mjs';

test('topic relationships are persisted, scoped to one subject, directional for prerequisites, and removable by their author', async () => {
  const app = await start();
  try {
    const owner = await signUp(app);
    const other = await signUp(app);
    const data = (await owner.c.post('/subjects', subjectBody({ name: 'Graph Theory', topics: [
      { name: 'Sets', unit: 'Foundations' }, { name: 'Relations', unit: 'Foundations' }, { name: 'Graph Traversal', unit: 'Graphs' },
    ] }))).data;
    const [sets, relations, traversal] = data.topics;

    const first = await other.c.post(`/topics/${sets.id}/relationships`, { targetTopicId: relations.id, type: 'PREREQUISITE' });
    assert.equal(first.status, 201, first.text);
    assert.deepEqual(first.data, {
      id: first.data.id, subjectId: data.subject.id, sourceTopicId: sets.id, targetTopicId: relations.id,
      type: 'PREREQUISITE', createdAt: first.data.createdAt, isMine: true,
    });
    assert.equal((await other.c.get('/catalog')).data.relationships.length, 1);

    const second = await other.c.post(`/topics/${relations.id}/relationships`, { targetTopicId: traversal.id, type: 'PREREQUISITE' });
    assert.equal(second.status, 201, second.text);
    const cycle = await other.c.post(`/topics/${traversal.id}/relationships`, { targetTopicId: sets.id, type: 'PREREQUISITE' });
    assert.equal(cycle.status, 409); assert.equal(cycle.error.code, 'PREREQUISITE_CYCLE');

    const duplicate = await other.c.post(`/topics/${relations.id}/relationships`, { targetTopicId: sets.id, type: 'RELATED' });
    assert.equal(duplicate.status, 201); // first undirected link
    const duplicateReverse = await other.c.post(`/topics/${sets.id}/relationships`, { targetTopicId: relations.id, type: 'RELATED' });
    assert.equal(duplicateReverse.status, 409); assert.equal(duplicateReverse.error.code, 'DUPLICATE_RELATIONSHIP');

    const anotherSubject = (await owner.c.post('/subjects', subjectBody({ name: 'Operating Systems', topics: [{ name: 'Processes' }] }))).data;
    const crossSubject = await other.c.post(`/topics/${sets.id}/relationships`, { targetTopicId: anotherSubject.topics[0].id, type: 'RELATED' });
    assert.equal(crossSubject.status, 409); assert.equal(crossSubject.error.code, 'DIFFERENT_SUBJECTS');
    const self = await other.c.post(`/topics/${sets.id}/relationships`, { targetTopicId: sets.id, type: 'RELATED' });
    assert.equal(self.status, 409); assert.equal(self.error.code, 'SELF_RELATIONSHIP');
    assert.equal((await other.c.post(`/topics/${sets.id}/relationships`, { targetTopicId: traversal.id, type: 'NOPE' })).status, 422);

    const relationId = first.data.id;
    assert.equal((await owner.c.del(`/topics/${sets.id}/relationships/${relationId}`)).status, 403); // not the author
    assert.equal((await other.c.del(`/topics/${sets.id}/relationships/${relationId}`)).status, 200);
    assert.equal((await other.c.get('/catalog')).data.relationships.length, 2);

    const admin = await makeAdmin(app);
    const adminDelete = await admin.c.del(`/topics/${second.data.sourceTopicId}/relationships/${second.data.id}`);
    assert.equal(adminDelete.status, 200);
  } finally {
    await app.close();
  }
});

test('topic relationship routes enforce authentication and subject visibility', async () => {
  const app = await start({ requireSubjectReview: true });
  try {
    const owner = await signUp(app); const other = await signUp(app); const anonymous = new Client(app.base);
    const data = (await owner.c.post('/subjects', subjectBody({ name: 'Pending Graph', topics: [{ name: 'Topic A' }, { name: 'Topic B' }] }))).data;
    const [a, b] = data.topics;
    assert.equal((await anonymous.post(`/topics/${a.id}/relationships`, { targetTopicId: b.id, type: 'RELATED' })).status, 401);
    assert.equal((await other.c.post(`/topics/${a.id}/relationships`, { targetTopicId: b.id, type: 'RELATED' })).status, 404);
    assert.equal((await owner.c.post(`/topics/${a.id}/relationships`, { targetTopicId: b.id, type: 'RELATED' })).status, 201);
    assert.equal((await other.c.get('/catalog')).data.relationships.length, 0);
  } finally {
    await app.close();
  }
});

test('schema v5 upgrades a v3 database without touching existing subject and topic rows', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { openDb } = await import('../src/db.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'studyprior-v3-'));
  const path = join(dir, 'legacy.db');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL, level TEXT, semester INTEGER);
    CREATE TABLE ratings (id TEXT PRIMARY KEY, level TEXT NOT NULL);
    CREATE TABLE subjects (id TEXT PRIMARY KEY);
    CREATE TABLE topics (id TEXT PRIMARY KEY);
    CREATE TABLE messages (id TEXT PRIMARY KEY, read_at TEXT);
    INSERT INTO users (id, role, level, semester) VALUES (1, 'STUDENT', 'SENIOR', 3);
    INSERT INTO ratings (id, level) VALUES ('old-rating', 'SENIOR');
    INSERT INTO subjects VALUES ('existing-subject');
    INSERT INTO topics VALUES ('existing-topic');
    PRAGMA user_version = 3;`);
  legacy.close();
  try {
    const upgraded = openDb(path);
    assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version, 5);
    assert.equal(upgraded.prepare('SELECT id FROM subjects').get().id, 'existing-subject');
    assert.equal(upgraded.prepare('SELECT id FROM topics').get().id, 'existing-topic');
    const migratedUser = upgraded.prepare('SELECT account_type, account_type_selected FROM users WHERE id=1').get();
    assert.equal(migratedUser.account_type, 'SENIOR'); assert.equal(migratedUser.account_type_selected, 0);
    assert.equal(upgraded.prepare("SELECT account_type FROM ratings WHERE id='old-rating'").get().account_type, 'SENIOR');
    assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ask_groups'").get().name, 'ask_groups');
    assert.equal(upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ask_group_message_receipts'").get().name, 'ask_group_message_receipts');
    assert.ok(upgraded.prepare('PRAGMA table_info(messages)').all().some(c => c.name === 'delivered_at'));
    upgraded.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
