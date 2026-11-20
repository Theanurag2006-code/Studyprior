import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Client, makeSenior, signUp, start, subjectBody, rate } from './helpers.mjs';

let app;
before(async () => { app = await start(); });
after(() => app.close());

test('senior profile returns only a visible senior and real contribution statistics', async () => {
  const senior = await makeSenior(app, { name: 'Senior With Work' });
  const junior = await signUp(app, { name: 'Profile Viewer' });
  const created = (await senior.c.post('/subjects', subjectBody({ name: 'Senior Authored Subject', topics: [{ name: 'Senior Authored Topic', description: 'A published topic.' }] }))).data;
  const elsewhere = (await junior.c.post('/subjects', subjectBody({ name: 'Viewer Subject', topics: [{ name: 'Viewer Topic' }] }))).data;
  await senior.c.post(`/topics/${elsewhere.topics[0].id}/ratings`, rate({ advice: 'Work through a small example first.', mistakes: 'Do not skip edge cases.' }));

  const response = await junior.c.get(`/seniors/${senior.user.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.data.profile.name, 'Senior With Work');
  assert.equal(response.data.stats.subjectsSubmitted, 1);
  assert.equal(response.data.stats.subjectsPublished, 1);
  assert.equal(response.data.stats.topicsSubmitted, 1);
  assert.equal(response.data.stats.topicsPublished, 1);
  assert.equal(response.data.stats.ratingsSubmitted, 1);
  assert.equal(response.data.stats.writtenExplanations, 1);
  assert.equal(response.data.stats.totalPublishedContributions, 3);
  assert.ok(response.data.profile.subjects.some(x => x.id === created.subject.id));
  assert.doesNotMatch(JSON.stringify(response.data), /pw_hash|@example\.test/);
});

test('senior feed contains real published contributions and paginates', async () => {
  const senior = await makeSenior(app, { name: 'Feed Senior' });
  const viewer = await signUp(app, { name: 'Feed Viewer' });
  const d = (await senior.c.post('/subjects', subjectBody({ name: 'Feed Subject', topics: [{ name: 'Feed Topic', description: 'Topic body' }, { name: 'Second Feed Topic', description: 'Another body' }] }))).data;
  const r = await senior.c.post(`/topics/${d.topics[0].id}/ratings`, rate({ advice: 'A written explanation for learners.' }));
  const first = await viewer.c.get(`/seniors/${senior.user.id}/feed?offset=0&limit=2`);
  assert.equal(first.status, 200);
  assert.equal(first.data.items.length, 2);
  assert.equal(first.data.total, 4); // one subject, two topics, one written rating
  assert.equal(first.data.hasMore, true);
  const all = await viewer.c.get(`/seniors/${senior.user.id}/feed?offset=0&limit=50`);
  assert.equal(all.data.items.length, 4);
  assert.ok(all.data.items.some(x => x.id === d.subject.id && x.type === 'subject'));
  assert.ok(all.data.items.some(x => x.id === d.topics[0].id && x.type === 'topic'));
  assert.ok(all.data.items.some(x => x.id === r.data.id && x.type === 'rating' && /written explanation/i.test(x.body)));
});

test('helpful contribution voting is persistent, idempotent, counted, and blocks self-voting', async () => {
  const senior = await makeSenior(app, { name: 'Helpful Senior' });
  const viewer = await signUp(app, { name: 'Helpful Viewer' });
  const d = (await senior.c.post('/subjects', subjectBody({ name: 'Helpful Subject', topics: [{ name: 'Helpful Topic' }] }))).data;
  const selfVote = await senior.c.put(`/contributions/topic/${d.topics[0].id}/helpful`);
  assert.equal(selfVote.status, 403);
  const first = await viewer.c.put(`/contributions/topic/${d.topics[0].id}/helpful`);
  assert.equal(first.status, 200); assert.equal(first.data.helpfulCount, 1); assert.equal(first.data.isHelpful, true);
  const again = await viewer.c.put(`/contributions/topic/${d.topics[0].id}/helpful`);
  assert.equal(again.data.helpfulCount, 1);
  const feed = await viewer.c.get(`/seniors/${senior.user.id}/feed`);
  const row = feed.data.items.find(x => x.type === 'topic' && x.id === d.topics[0].id);
  assert.equal(row.helpfulCount, 1); assert.equal(row.isHelpful, true);
  const withdrawn = await viewer.c.del(`/contributions/topic/${d.topics[0].id}/helpful`);
  assert.equal(withdrawn.data.helpfulCount, 0); assert.equal(withdrawn.data.isHelpful, false);
  const profile = await senior.c.get(`/seniors/${senior.user.id}`);
  assert.equal(profile.data.stats.helpfulVotesReceived, 0);
});

test('private senior profile cannot be discovered by others but remains accessible to its owner', async () => {
  const senior = await makeSenior(app, { name: 'Private Senior' });
  const viewer = await signUp(app);
  assert.equal((await senior.c.patch('/profile', { publicProfile: false })).status, 200);
  assert.equal((await viewer.c.get(`/seniors/${senior.user.id}`)).status, 404);
  assert.equal((await viewer.c.get(`/seniors/${senior.user.id}/feed`)).status, 404);
  assert.equal((await senior.c.get(`/seniors/${senior.user.id}`)).status, 200);
  assert.equal((await viewer.c.get('/catalog')).data.seniors.some(x => x.id === senior.user.id), false);
});

test('public senior statistics and feed do not reveal pending submissions', async () => {
  const reviewApp = await start({ requireSubjectReview: true });
  try {
    const author = await makeSenior(reviewApp, { name: 'Senior With Pending Work' });
    const viewer = await signUp(reviewApp, { name: 'Public Viewer' });
    const created = await author.c.post('/subjects', subjectBody({ name: 'Private Pending Senior Subject', topics: [{ name: 'Pending Senior Topic' }] }));
    assert.equal(created.status, 201);
    const own = await author.c.get(`/seniors/${author.user.id}`);
    assert.equal(own.data.stats.subjectsSubmitted, 1);
    assert.equal(own.data.stats.subjectsPending, 1);
    assert.equal(own.data.stats.topicsSubmitted, 1);
    const publicProfile = await viewer.c.get(`/seniors/${author.user.id}`);
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.data.stats.subjectsSubmitted, 0);
    assert.equal(publicProfile.data.stats.subjectsPending, 0);
    assert.equal(publicProfile.data.stats.topicsSubmitted, 0);
    const feed = await viewer.c.get(`/seniors/${author.user.id}/feed`);
    assert.equal(feed.data.total, 0);
    assert.equal(JSON.stringify(feed.data).includes('Private Pending Senior Subject'), false);
  } finally { await reviewApp.close(); }
});
