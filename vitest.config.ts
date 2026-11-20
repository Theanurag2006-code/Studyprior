import { defineConfig } from 'vitest/config';
// Only the frontend's own tests. (The server has its own tests under server/tests, run with `npm run api:test`.)
export default defineConfig({ test: { include: ['src/**/*.test.{ts,tsx}'] } });
