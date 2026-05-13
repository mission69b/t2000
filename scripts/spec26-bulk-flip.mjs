#!/usr/bin/env node
/**
 * SPEC 26 P8 bulk migration — adds `settleOnSuccess: true` to every
 * remaining `chargeProxy(...)` route in `apps/gateway/app/`.
 *
 * Two source patterns:
 *   1. PLAIN: `chargeProxy(amount, url, headers);`        → add 4th arg `{ settleOnSuccess: true }`
 *   2. OPTS:  `chargeProxy(amount, url, headers, opts);`  → insert `settleOnSuccess: true,` into `opts`
 *
 * Run with `--dry` to print planned edits without writing.
 *
 * SAFETY: skips files that already contain `settleOnSuccess` (so it's
 * idempotent — re-running after a partial run is safe).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DRY = process.argv.includes('--dry');

const filesRaw = execSync(`find apps/gateway/app -name 'route.ts'`, {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim().split('\n');

let migrated = 0;
let skippedAlreadyDone = 0;
let skippedNotChargeProxy = 0;
let unmatched = [];

for (const rel of filesRaw) {
  const full = resolve(ROOT, rel);
  const src = readFileSync(full, 'utf-8');

  if (!src.includes('chargeProxy(')) {
    skippedNotChargeProxy++;
    continue;
  }
  if (src.includes('settleOnSuccess')) {
    skippedAlreadyDone++;
    continue;
  }

  // Pattern A: PLAIN single-line. `chargeProxy('X', 'Y', { headers });`
  // Headers object closes with `});` on its own line.
  // We add `, { settleOnSuccess: true }` between the closing `}` and `);`.
  // This regex matches the LAST `});` of an export const POST = chargeProxy(...) statement.

  // Pattern B: OPTS — has a 4th argument. We insert `settleOnSuccess: true,` at the start of the opts object.

  // Simpler: walk the AST? No — the surface is small. Use line-based detection.
  // Detect form by counting top-level args of the chargeProxy call.

  // Count top-level `{...}` brace pairs inside the chargeProxy call.
  //  - 1 pair  → headers only (PLAIN, needs new opts arg appended)
  //  - 2 pairs → headers + opts (OPTS, insert settleOnSuccess into the LAST pair)
  // Counting brace-pairs avoids the "trailing comma counts as an extra arg"
  // pitfall that bit an earlier version of this script.
  const topLevelObjects = countTopLevelObjects(src);
  let next;
  if (topLevelObjects === 1) {
    // PLAIN — append a 4th arg. Find the chargeProxy call's closing `);`
    // (handles both `});` and `},\n);` shapes) and insert `, { settleOnSuccess: true }`
    // RIGHT BEFORE the `)`. We do this by finding the matching `)` for the
    // opening `chargeProxy(`.
    next = appendOptsArg(src);
  } else if (topLevelObjects === 2) {
    next = insertIntoLastObject(src);
  } else {
    // 0 or 3+ — unexpected shape, leave alone (will surface in unmatched).
  }

  if (next === src) {
    unmatched.push(rel);
    continue;
  }

  migrated++;
  if (DRY) {
    console.log(`--- ${rel} ---`);
    const diffPreview = next.split('\n').slice(0, 12).join('\n');
    console.log(diffPreview);
    console.log();
  } else {
    writeFileSync(full, next);
  }
}

console.log('---');
console.log(`Migrated:                ${migrated}`);
console.log(`Skipped (already done):  ${skippedAlreadyDone}`);
console.log(`Skipped (no chargeProxy):${skippedNotChargeProxy}`);
console.log(`Unmatched (manual fix):  ${unmatched.length}`);
if (unmatched.length) {
  for (const f of unmatched) console.log(`  - ${f}`);
}
console.log(DRY ? '(dry run — no files written)' : '(applied)');

// ─── helpers ──────────────────────────────────────────────────────────

function countTopLevelObjects(src) {
  // Walk inside the chargeProxy(...) call; count how many `{...}` pairs
  // open at depth === 1 (i.e. as direct args to chargeProxy).
  const idx = src.indexOf('chargeProxy(');
  if (idx === -1) return 0;
  let i = idx + 'chargeProxy('.length;
  let parenDepth = 1;
  let braceDepth = 0;
  let topLevelObjects = 0;
  while (i < src.length && parenDepth > 0) {
    const c = src[i];
    if (c === '(') parenDepth++;
    else if (c === ')') parenDepth--;
    else if (c === '{') {
      if (braceDepth === 0) topLevelObjects++;
      braceDepth++;
    } else if (c === '}') {
      braceDepth--;
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') {
          i += 2;
          let exprDepth = 1;
          while (i < src.length && exprDepth > 0) {
            if (src[i] === '{') exprDepth++;
            else if (src[i] === '}') exprDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
    } else if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return topLevelObjects;
}

function findChargeProxyCloseParen(src) {
  // Returns the index of the `)` that closes the `chargeProxy(...)` call.
  const start = src.indexOf('chargeProxy(');
  if (start === -1) return -1;
  let i = start + 'chargeProxy('.length;
  let parenDepth = 1;
  while (i < src.length && parenDepth > 0) {
    const c = src[i];
    if (c === '(') parenDepth++;
    else if (c === ')') {
      parenDepth--;
      if (parenDepth === 0) return i;
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') {
          i += 2;
          let exprDepth = 1;
          while (i < src.length && exprDepth > 0) {
            if (src[i] === '{') exprDepth++;
            else if (src[i] === '}') exprDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
    } else if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return -1;
}

function appendOptsArg(src) {
  const close = findChargeProxyCloseParen(src);
  if (close === -1) return src;

  // Walk backwards from `)` over whitespace/newlines to find the previous
  // non-whitespace char. Either `}` (end of headers) or `,` (trailing comma).
  let j = close - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  const prevChar = src[j];

  // Detect single-line vs multi-line by whether the close `)` is preceded by a newline.
  const between = src.slice(j + 1, close);
  const isMultiline = between.includes('\n');

  let toInsert;
  if (isMultiline) {
    // Match the indent of the headers arg by looking at the line after the
    // chargeProxy( opening — the first arg's indentation IS the call's indent.
    const callOpen = src.indexOf('chargeProxy(');
    const afterCallOpen = src.slice(callOpen + 'chargeProxy('.length);
    const firstArgIndentMatch = afterCallOpen.match(/^\s*\n(\s*)/);
    const indent = firstArgIndentMatch ? firstArgIndentMatch[1] : '  ';
    toInsert =
      prevChar === ','
        ? `\n${indent}{ settleOnSuccess: true },`
        : `,\n${indent}{ settleOnSuccess: true },`;
  } else {
    toInsert = prevChar === ',' ? ` { settleOnSuccess: true }` : `, { settleOnSuccess: true }`;
  }

  // Insert at position `j + 1` (right after the last non-ws char) so we
  // preserve the existing trailing-comma + newline shape if any.
  // For multiline trailing-comma case we want to insert AFTER the comma but
  // before the newline; for single-line we want to insert at j+1.
  if (isMultiline && prevChar === ',') {
    return src.slice(0, j + 1) + toInsert + src.slice(j + 1).replace(/^,?\n/, '\n');
  }
  return src.slice(0, j + 1) + toInsert + src.slice(j + 1);
}

function insertIntoLastObject(src) {
  // Find the LAST `{` that opens an object on the chargeProxy call's opts arg.
  // Strategy: find chargeProxy(, walk to the LAST top-level `{...}` before the closing `)`,
  // and insert ` settleOnSuccess: true,` right after that `{`.
  const start = src.indexOf('chargeProxy(');
  if (start === -1) return src;

  let i = start + 'chargeProxy('.length;
  let depth = 1;
  let lastOpenBrace = -1;

  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '{' && depth === 1) {
      lastOpenBrace = i;
      depth++;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') {
          i += 2;
          let exprDepth = 1;
          while (i < src.length && exprDepth > 0) {
            if (src[i] === '{') exprDepth++;
            else if (src[i] === '}') exprDepth--;
            i++;
          }
          continue;
        }
        i++;
      }
    } else if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }

  if (lastOpenBrace === -1) return src;

  // Insert ` settleOnSuccess: true,` after the `{`. Detect inline (single-line)
  // vs multi-line by looking at what follows the `{`.
  const after = src.slice(lastOpenBrace + 1);
  const isMultiline = /^\s*\n/.test(after);

  if (isMultiline) {
    // Indented multi-line object. Match the existing indent.
    const indentMatch = after.match(/^\s*\n(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '  ';
    const insert = `\n${indent}settleOnSuccess: true,`;
    return src.slice(0, lastOpenBrace + 1) + insert + after;
  }
  // Inline: `{ upstreamMethod: 'GET', ... }` → `{ settleOnSuccess: true, upstreamMethod: 'GET', ... }`
  return src.slice(0, lastOpenBrace + 1) + ' settleOnSuccess: true,' + after;
}
