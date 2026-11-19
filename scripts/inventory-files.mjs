/* Shared file-set resolver for the inventory scripts.
   Inside a git work tree the inventory covers exactly what a clone can contain: tracked files plus untracked files that
   are NOT ignored (`git ls-files --cached --others --exclude-standard`). Ignored local artefacts (e.g. `*.tmp` excluded via
   .git/info/exclude) therefore never enter the inventory, while new unignored files are still reported and tracked files
   deleted from disk are still reported as missing (they are filtered by existence here and compared with the map).
   Outside git (e.g. an extracted archive) it falls back to a full directory walk. */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

export function gitFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean).map((f) => f.replaceAll('\\', '/'));
  } catch {
    return null;
  }
}

async function walk(root, dir = root, acc = new Set()) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(item.name)) continue;
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) await walk(root, absolute, acc);
    else acc.add(path.relative(root, absolute).replaceAll('\\', '/'));
  }
  return acc;
}

/** Set of project files present on disk, relative POSIX paths. `source` tells which strategy was used. */
export async function projectFiles(root) {
  const listed = gitFiles(root);
  if (listed) {
    const present = listed.filter((f) => { const p = path.join(root, f); return existsSync(p) && statSync(p).isFile(); });
    return { files: new Set(present), source: 'git' };
  }
  return { files: await walk(root), source: 'walk' };
}

/* Content hash that is stable across checkouts: text files are hashed with CRLF normalised to LF (Windows working copies
   may hold CRLF while git stores LF), binary files (any NUL byte) are hashed as-is. Used by refresh and verify. */
import { createHash as _createHash } from 'node:crypto';
export function contentHash(bytes) {
  const isBinary = bytes.includes(0);
  const data = isBinary ? bytes : Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return _createHash('sha256').update(data).digest('hex');
}
