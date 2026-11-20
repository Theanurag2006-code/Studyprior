import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeSenior, rate, signUp, start, subjectBody } from './helpers.mjs';

let app;
before(async () => { app = await start(); });
after(() => app.close());

test('bulk topic summaries match the canonical per-topic community/senior/junior score', async () => {
  const owner = await signUp(app);
  const junior = await signUp(app);
  const senior = await makeSenior(app);
  const candidate = await signUp(app, { accountType: 'CANDIDATE' });
  const created = (await owner.c.post('/subjects', subjectBody({ name: 'Summary Contract', topics: [{ name: 'Weighted Topic' }] }))).data;
  const topicId = created.topics[0].id;
  assert.equal((await junior.c.post(`/topics/${topicId}/ratings`, rate({ importance: 4, difficulty: 1, exam: 5, interview: 3 }))).status, 201);
  assert.equal((await senior.c.post(`/topics/${topicId}/ratings`, rate({ importance: 5, difficulty: 5, exam: 4, interview: 4 }))).status, 201);
  assert.equal((await candidate.c.post(`/topics/${topicId}/ratings`, rate({ importance: 3, difficulty: 2, exam: 3, interview: 3 }))).status, 201);

  const perTopic = (await owner.c.get(`/topics/${topicId}/summary`)).data;
  const bulk = await owner.c.get('/topics/summaries');
  assert.equal(bulk.status, 200);
  assert.deepEqual(bulk.data[topicId], perTopic);
  assert.equal(bulk.data[topicId].overall.sampleCount, 3);
  assert.equal(bulk.data[topicId].senior.sampleCount, 1);
  assert.equal(bulk.data[topicId].junior.sampleCount, 1);
  assert.equal(bulk.data[topicId].candidate.sampleCount, 1);
  assert.equal(bulk.data[topicId].overall.priorityScore, 71);

  const empty = (await owner.c.post('/subjects', subjectBody({ name: 'Summary Empty Subject', topics: [{ name: 'Empty' }] }))).data.topics[0];
  assert.equal((await owner.c.get('/topics/summaries')).data[empty.id].overall.priorityScore, null);
});
