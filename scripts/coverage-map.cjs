#!/usr/bin/env node
/* Function-level coverage map of the project's own code (services/, apps/, shared/, functions/src/) from raw V8 coverage.
   The apps are classic scripts loaded into node:vm by the tests, which Node's built-in coverage report does not attribute;
   V8 still records them by filename, so this merges every process and every vm context (functions/domain → services/).
   Usage: npm run coverage:map   → writes coverage-map.txt (git-ignored) and prints the total. */
const fs = require('fs'), path = require('path');
const [covDir, root, outFile] = process.argv.slice(2);
const norm = u => { let p = u.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/'); try { p = decodeURIComponent(p); } catch {} const r = root.replace(/\\/g, '/'); if (p.toLowerCase().startsWith(r.toLowerCase())) p = p.slice(r.length + 1); return p.replace(/^functions\/domain\//, ''); };
const want = p => /^(services|apps|shared|functions\/src)\/.*\.js$/.test(p) && !/\/vendor\//.test(p);
const files = new Map();   // file -> Map(start -> {name, hit})
for (const f of fs.readdirSync(covDir)) {
  const j = JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8'));
  for (const s of j.result || []) {
    const p = norm(s.url || ''); if (!want(p)) continue;
    const m = files.get(p) || new Map(); files.set(p, m);
    const seen = {};
    const src = (() => { try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return ''; } })();
    for (const fn of s.functions) {
      const r = fn.ranges[0]; if (!r || fn === s.functions[0]) continue;   // skip the script body itself
      if (!fn.functionName) continue;                                     // named functions only (stable across wrappers)
      const k = fn.functionName + '#' + (seen[fn.functionName] = (seen[fn.functionName] || 0) + 1);
      const at = Math.max(0, src.indexOf(fn.functionName));
      const cur = m.get(k) || { name: fn.functionName, hit: false, at };
      cur.hit = cur.hit || r.count > 0; m.set(k, cur);
    }
  }
}
// every project file, including the ones no test ever loaded
const all = [];
const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) { if (!/node_modules|vendor|domain$/.test(p)) walk(p); } else if (want(p)) all.push(p); } };
['services', 'apps', 'shared', 'functions/src'].forEach(d => fs.existsSync(path.join(root, d)) && walk(d));
const lineOf = (p, off) => { try { return fs.readFileSync(path.join(root, p), 'utf8').slice(0, off).split('\n').length; } catch { return 0; } };
const rows = all.map(p => { const m = files.get(p); if (!m) return { p, total: 0, hit: 0, pct: -1, miss: [] }; const fns = [...m.values()]; const hit = fns.filter(x => x.hit).length; return { p, total: fns.length, hit, pct: Math.round(hit / fns.length * 100), miss: fns.filter(x => !x.hit && x.name !== '(anon)').map(x => x.name + ':' + lineOf(p, x.at)) }; });
rows.sort((a, b) => a.pct - b.pct);
const tot = rows.reduce((s, r) => s + r.total, 0), hit = rows.reduce((s, r) => s + r.hit, 0);
let txt = `functions covered: ${hit}/${tot} = ${Math.round(hit / tot * 100)}%  (files never loaded by a unit test: ${rows.filter(r => r.pct < 0).length}/${rows.length})\n\n`;
for (const r of rows) txt += `${r.pct < 0 ? ' NOT LOADED' : String(r.pct).padStart(3) + '%  ' + String(r.hit).padStart(4) + '/' + String(r.total).padEnd(4)}  ${r.p}${r.miss.length ? '\n        missed: ' + r.miss.slice(0, 40).join(', ') + (r.miss.length > 40 ? ' …+' + (r.miss.length - 40) : '') : ''}\n`;
fs.writeFileSync(outFile, txt); console.log(txt.split('\n')[0]);
