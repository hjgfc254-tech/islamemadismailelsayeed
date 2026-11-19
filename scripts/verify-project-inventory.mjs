import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectFiles, contentHash } from './inventory-files.mjs';

const root = process.cwd();
const mapPath = path.join(root, 'docs', 'AI_PROJECT_MAP.json');
const map = JSON.parse(await readFile(mapPath, 'utf8'));
const tracked = new Map(map.files.map((entry) => [entry.path.replaceAll('\\', '/'), entry]));
const ignored = new Set(['docs/AI_PROJECT_MAP.json']);
const { files: actual, source } = await projectFiles(root);
const missing = [...tracked.keys()].filter((file) => !actual.has(file));
const untracked = [...actual].filter((file) => !tracked.has(file));
const hashMismatches = [];

for (const [relative, entry] of tracked) {
  if (!actual.has(relative) || ignored.has(relative) || !entry.sha256) continue;
  const bytes = await readFile(path.join(root, relative));
  const hash = contentHash(bytes);   // line-ending agnostic
  if (hash !== entry.sha256) hashMismatches.push(relative);
}

console.log(`Inventory: ${actual.size} files on disk (${source === 'git' ? 'git: tracked + unignored' : 'directory walk'}); ${tracked.size} entries in AI_PROJECT_MAP.json`);
console.log(`Missing from disk: ${missing.length}`);
console.log(`Untracked files: ${untracked.length}`);
console.log(`SHA-256 mismatches: ${hashMismatches.length}`);

for (const file of missing) console.error(`MISSING: ${file}`);
for (const file of untracked) console.error(`UNTRACKED: ${file}`);
for (const file of hashMismatches) console.error(`HASH MISMATCH: ${file}`);

if (missing.length || untracked.length || hashMismatches.length) process.exitCode = 1;
