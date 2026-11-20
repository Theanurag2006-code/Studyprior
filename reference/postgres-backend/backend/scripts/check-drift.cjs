// Replays every migration into an EMPTY SHADOW database and compares the result with schema.prisma.
// Exit 0 = identical, 2 = drift (diff printed). It never touches your real data: use a dedicated database whose name contains "shadow".
// NOTE: Prisma resets the shadow database it is given, so never point SHADOW_DATABASE_URL at a database you care about.
require('dotenv').config();
const { spawnSync } = require('node:child_process');
const url = process.env.SHADOW_DATABASE_URL;
if (!url) { console.error('Set SHADOW_DATABASE_URL (see backend/.env.example).'); process.exit(1); }
if (!/shadow/i.test(new URL(url).pathname)) { console.error('Refusing: the shadow database name must contain "shadow" so real data is never reset.'); process.exit(1); }
const r = spawnSync('npx', ['prisma', 'migrate', 'diff', '--from-migrations', 'prisma/migrations', '--to-schema-datamodel', 'prisma/schema.prisma', '--shadow-database-url', url, '--exit-code'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status === 0) console.log('No drift: the migrations produce exactly the Prisma schema.');
else if (r.status === 2) console.error('DRIFT detected: see the diff above. Do not edit migrations that were already applied; add a new migration.');
process.exit(r.status ?? 1);
