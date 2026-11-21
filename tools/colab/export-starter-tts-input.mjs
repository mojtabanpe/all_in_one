#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCES = [
  'libs/applets/english-learning/contracts/src/lib/daily-life-sample.ts',
  'libs/applets/english-learning/api/src/lib/starter-data.ts',
];

const ENTRY_RE =
  /term:\s*(['"])(.*?)\1[\s\S]*?definition:\s*(?:\n\s*)?(['"])(.*?)\3[\s\S]*?example:\s*(?:\n\s*)?(['"])(.*?)\5/g;

const seen = new Set();
const items = [];

function addText(text, kind, term) {
  const normalized = text.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  const id = createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex')
    .slice(0, 16);
  items.push({ id, kind, term, text: normalized });
}

for (const rel of SOURCES) {
  const src = readFileSync(resolve(ROOT, rel), 'utf8');
  for (const m of src.matchAll(ENTRY_RE)) {
    const term = m[2];
    const definition = m[4];
    addText(term, 'term', term);
    addText(definition, 'definition', term);
  }
}

const payload = {
  version: 1,
  voice: 'af_bella',
  speed: 0.95,
  count: items.length,
  items,
};

const outPath = process.argv[2];
const json = JSON.stringify(payload, null, 2) + '\n';
if (outPath) {
  writeFileSync(outPath, json, 'utf8');
  console.log(`Wrote ${items.length} items to ${outPath}`);
} else {
  process.stdout.write(json);
}
