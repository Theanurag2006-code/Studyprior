// Static cross-check: prisma/schema.prisma  vs  all prisma/migrations/*/migration.sql (applied in order).
// Needs no database and no dependencies:  node scripts/verify-migrations.mjs
// Compares tables, columns, types, NULL/NOT NULL, primary keys, indexes (names, uniqueness, columns), foreign keys (names, targets, actions) and enums.
// NOT compared: DEFAULT values, CHECK constraints (Prisma cannot model them), and anything the SQL does with data (UPDATE statements).
// This is a safety net, not a replacement for `npm run db:check-drift` against a real PostgreSQL shadow database.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const migs = readdirSync(join(root, 'prisma/migrations'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
const sql = migs.map(d => readFileSync(join(root, 'prisma/migrations', d, 'migration.sql'), 'utf8').replace(/--.*$/gm, '')).join('\n');
const problems = []; const bad = m => problems.push(m);
const q = s => s.replace(/"/g, '').trim(); const cols = s => s.split(',').map(x => q(x));

// ---------- schema side
const enums = {}; for (const m of schema.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\}/g)) { const map = /@@map\("(\w+)"\)/.exec(m[2]); enums[m[1]] = { db: map ? map[1] : m[1], values: m[2].split('\n').map(l => l.trim()).filter(l => /^[A-Z_]+$/.test(l)) }; }
const modelNames = [...schema.matchAll(/model\s+(\w+)\s*\{/g)].map(m => m[1]);
const S = {}; // table -> { cols:{name:{type,nullable}}, pk:[], idx:{name:{unique,cols}}, fks:{name:{cols,ref,refCols,del}} }
const tableOf = {}; for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) tableOf[m[1]] = (/@@map\("(\w+)"\)/.exec(m[2]) || [, m[1]])[1];
const colOf = {}; // "Model.field" -> db column
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const [, model, body] = m; const t = { cols: {}, pk: [], idx: {}, fks: {} }; S[tableOf[model]] = t;
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean); const fieldCol = {};
  for (const l of lines) { const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(l); if (!f || l.startsWith('@@')) continue; const [, name, type, arr, opt, rest] = f; if (modelNames.includes(type) || arr) continue; fieldCol[name] = (/@map\("(\w+)"\)/.exec(rest) || [, name])[1]; colOf[`${model}.${name}`] = fieldCol[name]; }
  for (const l of lines) {
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(l);
    if (f && !l.startsWith('@@')) {
      const [, name, type, arr, opt, rest] = f;
      if (modelNames.includes(type)) { const rel = /@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]([^)]*)\)/.exec(rest); if (!rel) continue;
        const fc = rel[1].split(',').map(x => fieldCol[x.trim()]); const del = (/onDelete:\s*(\w+)/.exec(rel[3]) || [, 'Restrict'])[1];
        t.fks[`${tableOf[model]}_${fc[0]}_fkey`] = { cols: fc, ref: tableOf[type], refCols: rel[2].split(',').map(x => colOf[`${type}.${x.trim()}`] || x.trim()), del: { Cascade: 'CASCADE', SetNull: 'SET NULL', Restrict: 'RESTRICT' }[del] }; continue; }
      if (arr) continue; const col = fieldCol[name]; let ty;
      if (enums[type]) ty = enums[type].db.toUpperCase();
      else { const db = /@db\.(\w+)(?:\(([^)]*)\))?/.exec(rest); const arg = db && db[2] ? `(${db[2].replace(/\s/g, '')})` : '';
        ty = { String: db ? (db[1] === 'Uuid' ? 'UUID' : 'VARCHAR' + arg) : 'TEXT', Int: 'INTEGER', Boolean: 'BOOLEAN', Json: 'JSONB', Decimal: 'DECIMAL' + arg, DateTime: db ? (db[1] === 'Date' ? 'DATE' : 'TIMESTAMPTZ' + arg) : 'TIMESTAMP(3)' }[type]; }
      t.cols[col] = { type: ty, nullable: !!opt };
      if (/@id\b/.test(rest)) t.pk = [col];
      const u = /@unique\(map:\s*"(\w+)"\)/.exec(rest); if (u) t.idx[u[1]] = { unique: true, cols: [col] };
    } else { const a = /@@(id|unique|index)\(\[([^\]]+)\](?:,\s*map:\s*"(\w+)")?\)/.exec(l); if (!a) continue; const c = a[2].split(',').map(x => fieldCol[x.trim()]);
      if (a[1] === 'id') t.pk = c; else if (a[3]) t.idx[a[3]] = { unique: a[1] === 'unique', cols: c }; else bad(`${tableOf[model]}: @@${a[1]} without an explicit map: name (add one so SQL and schema agree)`); }
  }
}
// ---------- SQL side
const D = {}; const ensure = t => (D[t] ||= { cols: {}, pk: [], idx: {}, fks: {} });
const dbEnums = {}; for (const m of sql.matchAll(/CREATE TYPE "(\w+)" AS ENUM \(([^)]*)\)/g)) dbEnums[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map(x => x[1]);
for (const m of sql.matchAll(/CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g)) { const t = ensure(m[1]);
  for (const raw of m[2].split('\n').map(l => l.trim().replace(/,$/, '')).filter(Boolean)) {
    const c = /^"(\w+)"\s+(.+?)(?=\s+NOT NULL|\s+DEFAULT|$)/.exec(raw); if (c && !raw.startsWith('CONSTRAINT')) t.cols[c[1]] = { type: q(c[2]).replace(/\s/g, '').toUpperCase(), nullable: !/NOT NULL/.test(raw) };
    const pk = /PRIMARY KEY \(([^)]+)\)/.exec(raw); if (pk) t.pk = cols(pk[1]); } }
for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ALTER COLUMN "(\w+)" DROP NOT NULL/g)) { const c = D[m[1]]?.cols[m[2]]; if (c) c.nullable = true; else bad(`SQL: ALTER ${m[1]}.${m[2]} DROP NOT NULL refers to a missing column`); }
for (const m of sql.matchAll(/CREATE (UNIQUE )?INDEX "(\w+)" ON "(\w+)"\(([^)]+)\)/g)) ensure(m[3]).idx[m[2]] = { unique: !!m[1], cols: cols(m[4]) };
for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \(([^)]+)\) REFERENCES "(\w+)"\(([^)]+)\) ON DELETE ([A-Z ]+?) ON UPDATE/g)) ensure(m[1]).fks[m[2]] = { cols: cols(m[3]), ref: m[4], refCols: cols(m[5]), del: m[6].trim() };
// ---------- compare
for (const [n, e] of Object.entries(enums)) { const s = dbEnums[e.db]; if (!s) bad(`enum ${e.db}: missing in SQL`); else if (s.join() !== e.values.join()) bad(`enum ${e.db}: schema [${e.values}] vs SQL [${s}]`); }
for (const n of Object.keys(dbEnums)) if (!Object.values(enums).some(e => e.db === n)) bad(`enum ${n}: in SQL but not in schema`);
for (const t of new Set([...Object.keys(S), ...Object.keys(D)])) {
  if (!S[t]) { bad(`table ${t}: in SQL but not in schema`); continue; } if (!D[t]) { bad(`table ${t}: in schema but not in SQL`); continue; }
  for (const c of new Set([...Object.keys(S[t].cols), ...Object.keys(D[t].cols)])) { const a = S[t].cols[c], b = D[t].cols[c];
    if (!a) bad(`${t}.${c}: column only in SQL`); else if (!b) bad(`${t}.${c}: column only in schema`); else { if (a.type !== b.type) bad(`${t}.${c}: type schema ${a.type} vs SQL ${b.type}`); if (a.nullable !== b.nullable) bad(`${t}.${c}: nullability schema ${a.nullable ? 'NULL' : 'NOT NULL'} vs SQL ${b.nullable ? 'NULL' : 'NOT NULL'}`); } }
  if (S[t].pk.join() !== D[t].pk.join()) bad(`${t}: primary key schema (${S[t].pk}) vs SQL (${D[t].pk})`);
  for (const i of new Set([...Object.keys(S[t].idx), ...Object.keys(D[t].idx)])) { const a = S[t].idx[i], b = D[t].idx[i];
    if (!a) bad(`${t}: index ${i} only in SQL`); else if (!b) bad(`${t}: index ${i} only in schema`); else if (a.unique !== b.unique || a.cols.join() !== b.cols.join()) bad(`${t}: index ${i} differs (schema ${a.unique ? 'UNIQUE ' : ''}${a.cols} vs SQL ${b.unique ? 'UNIQUE ' : ''}${b.cols})`); }
  for (const f of new Set([...Object.keys(S[t].fks), ...Object.keys(D[t].fks)])) { const a = S[t].fks[f], b = D[t].fks[f];
    if (!a) bad(`${t}: foreign key ${f} only in SQL`); else if (!b) bad(`${t}: foreign key ${f} only in schema`); else if (a.cols.join() !== b.cols.join() || a.ref !== b.ref || a.refCols.join() !== b.refCols.join() || a.del !== b.del) bad(`${t}: foreign key ${f} differs (schema ${a.cols}->${a.ref}(${a.refCols}) ${a.del} vs SQL ${b.cols}->${b.ref}(${b.refCols}) ${b.del})`); }
}
const nT = Object.keys(S).length, nC = Object.values(S).reduce((a, t) => a + Object.keys(t.cols).length, 0), nI = Object.values(S).reduce((a, t) => a + Object.keys(t.idx).length, 0), nF = Object.values(S).reduce((a, t) => a + Object.keys(t.fks).length, 0);
console.log(`Compared ${nT} tables, ${nC} columns, ${nI} indexes, ${nF} foreign keys, ${Object.keys(enums).length} enums across ${migs.length} migration(s): ${migs.join(', ')}`);
if (problems.length) { console.error(`\n${problems.length} DISCREPANCY(IES):`); problems.forEach(p => console.error(' - ' + p)); process.exit(1); }
console.log('No discrepancies found by this static check (see the header comment for what it does not cover).');
