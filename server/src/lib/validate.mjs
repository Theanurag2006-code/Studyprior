import { ApiError } from './errors.mjs';

/** Tiny request validator. Collects every problem, rejects unknown fields, returns clean values. */
export function validator(input) {
  const issues = []; const used = new Set(); const out = {};
  const isObj = input !== null && typeof input === 'object' && !Array.isArray(input); const obj = isObj ? input : {};
  if (!isObj) issues.push({ field: 'body', message: 'Expected a JSON object.' });
  const take = (f, optional) => { used.add(f); const v = obj[f]; if (v === undefined) { if (!optional) issues.push({ field: f, message: 'Required.' }); return undefined; } return v; };
  const bad = (f, m) => { issues.push({ field: f, message: m }); return undefined; };
  const v = {
    str(f, { min = 0, max = 1000, optional = false, nullable = false, lower = false, squash = true } = {}) {
      const x = take(f, optional); if (x === undefined) return undefined; if (x === null && nullable) return (out[f] = null);
      if (typeof x !== 'string') return bad(f, 'Must be text.'); let s = squash ? x.replace(/\s+/g, ' ').trim() : x.trim(); if (lower) s = s.toLowerCase();
      if (s.length < min) return bad(f, min === 1 ? 'Required.' : `Use at least ${min} characters.`); if (s.length > max) return bad(f, `Use at most ${max} characters.`); return (out[f] = s);
    },
    text(f, o = {}) { return v.str(f, { ...o, squash: false }); }, // keeps line breaks (notes, messages)
    int(f, { min = -1e9, max = 1e9, optional = false } = {}) { const x = take(f, optional); if (x === undefined) return undefined; if (!Number.isInteger(x)) return bad(f, 'Must be a whole number.'); if (x < min || x > max) return bad(f, `Must be between ${min} and ${max}.`); return (out[f] = x); },
    num(f, { min = -1e9, max = 1e9, optional = false } = {}) { const x = take(f, optional); if (x === undefined) return undefined; if (typeof x !== 'number' || !Number.isFinite(x)) return bad(f, 'Must be a number.'); if (x < min || x > max) return bad(f, `Must be between ${min} and ${max}.`); return (out[f] = x); },
    bool(f, { optional = false } = {}) { const x = take(f, optional); if (x === undefined) return undefined; if (typeof x !== 'boolean') return bad(f, 'Must be true or false.'); return (out[f] = x); },
    oneOf(f, values, { optional = false } = {}) { const x = take(f, optional); if (x === undefined) return undefined; if (!values.includes(x)) return bad(f, `Must be one of: ${values.join(', ')}.`); return (out[f] = x); },
    raw(f, { optional = false } = {}) { const x = take(f, optional); if (x !== undefined) out[f] = x; return x; },
    issue: (f, m) => { issues.push({ field: f, message: m }); },
    done({ strict = true } = {}) {
      if (strict) for (const k of Object.keys(obj)) if (!used.has(k)) issues.push({ field: k, message: 'Unrecognized field (not accepted).' });
      if (issues.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', issues); return out;
    },
  };
  return v;
}
