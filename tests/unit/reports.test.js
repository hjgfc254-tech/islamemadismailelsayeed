'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const R=require(path.join(root,'apps/admin/pages/reports.page.js'));
const F=require(path.join(root,'apps/admin/pages/finance-dashboard.page.js'));
const S=require(path.join(root,'apps/admin/pages/settlements.page.js'));
const err=(fn)=>{try{fn()}catch(e){return e}throw new Error('expected throw')};
const CATS=['all'].concat(F.CATEGORIES.map(c=>c.id));
const ids=R.REPORTS.map(r=>r.id);
const all=(f)=>{for(const id of ids)for(const p of ['7','30','90'])for(const c of CATS)f(R.buildReport(id,p,c),id,p,c)};

test('catalogue: 4 unique reports, each with a builder; unknown id throws',()=>{
  assert.deepStrictEqual(ids,['finance-summary','commission-collection','provider-dues','discrepancies']);
  assert.strictEqual(err(()=>R.buildReport('nope','30','all')).message,'Unknown report');
  assert.strictEqual(err(()=>R.buildReport(undefined,'30','all')).message,'Unknown report');
  assert.strictEqual(err(()=>R.buildReport('__proto__','30','all')).message,'Unknown report');
});
test('every report × period × category builds; all reconciliation checks pass',()=>{
  all((r,id,p,c)=>{assert(r.checks.length>=2,id);const bad=r.checks.filter(x=>!x.ok);assert.deepStrictEqual(bad,[],id+p+c)});
});
test('rows/totals/chart are consistent: totals equal column sums, one chart item per row, finite numbers',()=>{
  all((r,id,p,c)=>{
    assert.strictEqual(r.chart.items.length,r.rows.length);assert.strictEqual(r.empty,r.rows.length===0);
    for(const col of r.columns.filter(x=>['money','int','percent'].includes(x.type)&&x.type!=='percent')){
      assert.strictEqual(r.totals[col.key],r.rows.reduce((a,x)=>a+x[col.key],0),id+col.key);
      r.rows.forEach(x=>assert(Number.isFinite(x[col.key]),id+col.key));}
    r.chart.items.forEach(i=>assert(Number.isFinite(i.value)&&i.value>=0&&typeof i.text==='string'));
  });
});
test('finance-summary ties to the finance dashboard; «all» = sum of single categories',()=>{
  for(const p of ['7','30','90']){
    const r=R.buildReport('finance-summary',p,'all'),m=F.buildModel(p,'all',{reviewed:{}});
    for(const k of ['gmv','commission','collected','providerNet','settled','pendingDues'])assert.strictEqual(r.totals[k],m.totals[k],p+k);
    for(const k of ['gmv','commission','pendingDues'])assert.strictEqual(F.CATEGORIES.reduce((a,c)=>a+R.buildReport('finance-summary',p,c.id).totals[k],0),r.totals[k]);
  }
});
test('commission-collection: rate is collected/commission (2 decimals), 0 when nothing is calculated',()=>{
  const r=R.buildReport('commission-collection','30','electric');
  assert.strictEqual(r.rows.length,1);assert.strictEqual(r.rows[0].collectRate,90);assert.strictEqual(r.totals.collectRate,90);
  const t=R.buildReport('commission-collection','30','all');assert.strictEqual(t.totals.collectRate,Math.round(t.totals.collected/t.totals.commission*10000)/100);
});
test('provider-dues: fixed 30-day basis ignores the period, ties to settlements and finance 30d',()=>{
  const a=R.buildReport('provider-dues','7','all'),b=R.buildReport('provider-dues','90','all');
  assert.strictEqual(a.period,'30');assert.deepStrictEqual(a.rows,b.rows);assert.strictEqual(a.range.days,30);
  assert.strictEqual(a.rows.length,8);const t=S.totals(S.buildFixtures());
  assert.strictEqual(a.totals.total,t.total);assert.strictEqual(a.totals.settled,t.settled);assert.strictEqual(a.totals.outstanding,t.outstanding);assert.strictEqual(a.totals.onHold,t.onHold);
  assert.strictEqual(R.buildReport('provider-dues','30','plumbing').rows.length,2);
});
test('discrepancies: period/category filters, signed difference, empty state is reachable',()=>{
  const n=(p,c)=>R.buildReport('discrepancies',p,c).rows.length;
  assert(n('7','all')<n('30','all')&&n('30','all')<n('90','all'));assert.strictEqual(n('90','all'),F.DISCREPANCIES.length);
  const e=R.buildReport('discrepancies','7','carpentry');assert.strictEqual(e.empty,true);assert.strictEqual(e.rows.length,0);assert.strictEqual(e.totals.diff,0);
  const r=R.buildReport('discrepancies','90','all');r.rows.forEach(x=>assert.strictEqual(x.diff,x.recorded-x.expected));
  assert(r.rows.some(x=>x.diff<0)&&r.rows.some(x=>x.diff>0));
});
test('unknown period/category fall back to 30 days / all; ranges end on the fixed demo date',()=>{
  const r=R.buildReport('finance-summary','zzz','zzz');assert.strictEqual(r.period,'30');assert.strictEqual(r.category,'all');
  assert.deepStrictEqual(R.periodRange('7'),{days:7,from:'2026-11-03',to:'2026-11-09'});
  assert.deepStrictEqual(R.periodRange('30'),{days:30,from:'2026-10-11',to:'2026-11-09'});
  assert.strictEqual(R.periodRange('90').from,'2026-08-12');assert.strictEqual(R.periodRange('x').days,30);
});
test('safeBuild never throws and reports the error state',()=>{
  const bad=R.safeBuild('nope','30','all');assert.strictEqual(bad.ok,false);assert.strictEqual(bad.error,'Unknown report');
  assert.strictEqual(R.safeBuild('finance-summary','30','all').ok,true);
});
test('buildReport does not mutate shared fixtures and is deterministic',()=>{
  const before=JSON.stringify([F.DISCREPANCIES,F.CATEGORIES,S.buildFixtures()]);
  const a=JSON.stringify(R.buildReport('discrepancies','90','all')),b=JSON.stringify(R.buildReport('discrepancies','90','all'));
  assert.strictEqual(a,b);assert.strictEqual(JSON.stringify([F.DISCREPANCIES,F.CATEGORIES,S.buildFixtures()]),before);
});
test('CSV: BOM, CRLF, demo disclosure, header, raw numeric values, totals row',()=>{
  const r=R.buildReport('finance-summary','30','all'),csv=R.toCsv(r),lines=csv.slice(1).split('\r\n');
  assert.strictEqual(csv.charCodeAt(0),0xFEFF);assert(csv.endsWith('\r\n'));assert(csv.includes('بيانات تجريبية'));
  const h=lines.findIndex(l=>l.startsWith('التصنيف,قيمة الطلبات'));assert(h>0);
  assert.strictEqual(lines.slice(h+1).filter(Boolean).length,r.rows.length+1);
  assert(lines[h+1].includes(','+r.rows[0].gmv+','));assert(lines[lines.length-2].startsWith('الإجمالي,'+r.totals.gmv+','));
  assert(!/ج\.م/.test(lines.slice(h).join('')),'numeric cells must be raw numbers');
});
test('CSV escaping: quotes/commas/newlines quoted; formula injection neutralised; numbers stay numeric',()=>{
  assert.strictEqual(R.csvCell('a,b'),'"a,b"');assert.strictEqual(R.csvCell('say "hi"'),'"say ""hi"""');assert.strictEqual(R.csvCell('x\ny'),'"x\ny"');
  for(const s of ['=1+1','+1','-1','@SUM(A1)','\t=1'])assert(R.csvCell(s).startsWith("'"),s);
  assert.strictEqual(R.csvCell(-150),'-150');assert.strictEqual(R.csvCell(0),'0');assert.strictEqual(R.csvCell(null),'');assert.strictEqual(R.csvCell(NaN),'');
  const r=R.buildReport('discrepancies','90','all');r.rows[0].note='=HYPERLINK("x")';assert(R.toCsv(r).includes('"\'=HYPERLINK(""x"")"'));
});
test('CSV file name is deterministic and safe',()=>{
  assert.strictEqual(R.csvFileName(R.buildReport('discrepancies','7','plumbing')),'hansalehlak-demo-discrepancies-7d-plumbing.csv');
  all(r=>assert(/^[a-z0-9-]+\.csv$/.test(R.csvFileName(r))));
});
test('export log: immutable, one entry per export, refuses empty reports, local only',()=>{
  const r=R.buildReport('finance-summary','30','all'),a=[],b=R.recordExport(a,r,'2026-11-09T10:00:00.000Z');
  assert.strictEqual(a.length,0);assert.strictEqual(b.length,1);
  assert.deepStrictEqual(b[0],{at:'2026-11-09T10:00:00.000Z',reportId:'finance-summary',title:r.title,period:'30',category:'all',categoryLabel:'كل التصنيفات',rowCount:4,fileName:R.csvFileName(r),local:true});
  assert.strictEqual(R.recordExport(b,r).length,2);
  assert.strictEqual(err(()=>R.recordExport([],R.buildReport('discrepancies','7','carpentry'))).message,'Nothing to export');
  assert.strictEqual(err(()=>R.recordExport([],null)).message,'Nothing to export');
});
test('cell formatting: money, percent, int, delta; empty values',()=>{
  assert(R.cellText({type:'money'},1500).endsWith('ج.م'));assert(R.cellText({type:'percent'},90).endsWith('٪'));
  assert(R.cellText({type:'delta'},100).startsWith('زيادة'));assert(R.cellText({type:'delta'},-100).startsWith('نقص'));assert.strictEqual(R.cellText({type:'delta'},0),'لا فرق');
  assert.strictEqual(R.cellText({type:'money'},null),'');
});
test('resetState restores defaults and clears the export log',()=>{
  R._state().report='discrepancies';R.resetState();assert.deepStrictEqual(R._state(),{report:'finance-summary',period:'30',category:'all'});assert.strictEqual(R._log().length,0);
});
test('source boundaries: demo disclosure, shared money util, no network/database calls, no local formatter',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/reports.page.js'),'utf8');
  assert.match(src,/بيانات تجريبية/);assert.match(src,/لا يتم تنفيذ أي دفع أو تحصيل أو تسوية/);assert.match(src,/HSMoney/);
  assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|firebase|firestore|sendBeacon|localStorage|indexedDB/i);
  assert.doesNotMatch(src,/toLocaleString|Intl\.NumberFormat/);
});
console.log('\nreports.test.js: '+passed+' checks passed');
