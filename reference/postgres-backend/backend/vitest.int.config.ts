import { defineConfig } from 'vitest/config';
// Integration tests talk to a REAL PostgreSQL test database (DATABASE_URL_TEST). They run one file at a time.
export default defineConfig({ test: { include: ['tests/**/*.int.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 20000, hookTimeout: 30000 } });
