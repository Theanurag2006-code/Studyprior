import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app, prisma } from './helpers';

afterAll(() => prisma.$disconnect());
describe('GET /api/v1/health', () => {
  it('reports status and database connectivity without leaking internals', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200); expect(res.body.data).toMatchObject({ status: 'ok', database: 'up' });
    expect(JSON.stringify(res.body)).not.toMatch(/postgres(ql)?:\/\/|password|secret/i);
  });
  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope'); expect(res.status).toBe(404); expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
