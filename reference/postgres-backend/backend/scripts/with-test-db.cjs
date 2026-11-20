// Runs a command with DATABASE_URL pointed at the TEST database (and refuses if it does not look like one).
require('dotenv').config();
const { spawnSync } = require('node:child_process');
const url = process.env.DATABASE_URL_TEST;
if (!url) { console.error('DATABASE_URL_TEST is not set (see backend/.env.example).'); process.exit(1); }
if (!/test/i.test(new URL(url).pathname)) { console.error('Refusing: the test database name must contain "test".'); process.exit(1); }
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
