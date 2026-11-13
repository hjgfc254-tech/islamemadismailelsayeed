'use strict';
const path=require('path'),fs=require('fs'),assert=require('assert');
const root=path.join(__dirname,'../..');
let passed=0; const test=(n,f)=>{try{f();passed++;console.log('✓ '+n)}catch(e){console.error('✗ '+n+'\n '+e.message);process.exitCode=1}};
const S=require(path.join(root,'apps/admin/pages/security.page.js'));
const G=require(path.join(root,'shared/components/data-grid.js'));
const data=()=>({alerts:S.buildAlerts(),sessions:S.buildSessions(),logins:S.buildLogins()});
const throwsMsg=(f,m)=>assert.throws(f,(e)=>e.message===m,m);
test('fixtures are valid and counters match a manual recount',()=>{
  S.resetState();assert.deepStrictEqual(S.validateData(data()),[]);
  const c=S.counts(),d=data();
  assert.strictEqual(c.openAlerts,d.alerts.filter(a=>a.status==='open').length);
  assert.strictEqual(c.critical,d.alerts.filter(a=>a.status==='open'&&a.severity==='critical').length);
  assert.strictEqual(c.activeSessions,d.sessions.filter(s=>s.status==='active').length);
  assert.strictEqual(c.failedLogins,d.logins.filter(l=>l.result!=='success').length);
});
test('validation catches duplicates, bad/future time, unknown values, missing reasons, current-session rules',()=>{
  const d=data(),bad=(k,i,o)=>{const x=data();x[k][i]=Object.assign({},x[k][i],o);return S.validateData(x)};
  assert(bad('alerts',0,{at:'nope'}).some(x=>/timestamp/.test(x)));assert(bad('alerts',0,{at:'2026-12-01T00:00:00Z'}).some(x=>/future/.test(x)));
  assert(bad('alerts',0,{severity:'zz'}).some(x=>/severity/.test(x)));assert(bad('alerts',0,{actorId:'zz'}).some(x=>/actor/.test(x)));
  assert(bad('alerts',3,{escalation:' '}).some(x=>/escalated/.test(x)));assert(bad('alerts',4,{resolution:''}).some(x=>/resolved/.test(x)));
  assert(bad('sessions',0,{status:'ended'}).some(x=>/current session/.test(x)));assert(bad('sessions',1,{lastSeenAt:'2026-11-01T00:00:00Z'}).some(x=>/before start/.test(x)));
  assert(bad('sessions',1,{current:true}).some(x=>/more than one/.test(x)));assert(bad('logins',0,{reason:''}).some(x=>/reason/.test(x)));
  d.alerts.push(d.alerts[0]);assert(S.validateData(d).some(x=>/duplicate/.test(x)));
});
test('alert workflow: allowed transitions, resolved is final, reason required for escalate/resolve, immutability',()=>{
  S.resetState();const a=S.buildAlerts(),lg=[],snap=JSON.stringify(a);
  assert(S.canTransition('open','acknowledged'));assert(S.canTransition('escalated','resolved'));assert(!S.canTransition('resolved','open'));assert(!S.canTransition('escalated','acknowledged'));
  assert.deepStrictEqual(S.allowedActions({status:'resolved'}),[]);
  const r=S.transitionAlert(a,lg,'al1','acknowledged');assert.strictEqual(r.alerts.find(x=>x.id==='al1').status,'acknowledged');assert.strictEqual(r.log.length,1);
  throwsMsg(()=>S.transitionAlert(a,lg,'al1','escalated',{note:'  '}),'Reason required');
  throwsMsg(()=>S.transitionAlert(a,lg,'al1','resolved',{note:'ab'}),'Reason required');
  throwsMsg(()=>S.transitionAlert(a,lg,'al1','resolved',{note:'x'.repeat(301)}),'Reason required');
  throwsMsg(()=>S.transitionAlert(a,lg,'al5','open'),'Transition not allowed');throwsMsg(()=>S.transitionAlert(a,lg,'zz','acknowledged'),'Unknown alert');
  const e=S.transitionAlert(a,lg,'al2','escalated',{note:' طلب مراجعة '});assert.strictEqual(e.alerts.find(x=>x.id==='al2').escalation,'طلب مراجعة');
  const f=S.transitionAlert(e.alerts,e.log,'al2','resolved',{note:'تمت المراجعة'});assert.strictEqual(f.alerts.find(x=>x.id==='al2').status,'resolved');
  assert.strictEqual(JSON.stringify(a),snap);assert.deepStrictEqual(S.validateData({alerts:f.alerts,sessions:S.buildSessions(),logins:S.buildLogins()}),[]);
});
test('sessions: only non-current active sessions can be ended, with a reason; immutable',()=>{
  const s=S.buildSessions(),snap=JSON.stringify(s);
  throwsMsg(()=>S.revokeSession(s,[],'ss1',{note:'سبب كافٍ'}),'Current session');throwsMsg(()=>S.revokeSession(s,[],'ss5',{note:'سبب كافٍ'}),'Session not active');
  throwsMsg(()=>S.revokeSession(s,[],'ss2',{note:''}),'Reason required');throwsMsg(()=>S.revokeSession(s,[],'zz',{note:'سبب كافٍ'}),'Unknown session');
  const r=S.revokeSession(s,[],'ss2',{note:'جهاز مشبوه'});const x=r.sessions.find(q=>q.id==='ss2');
  assert.strictEqual(x.status,'revoked');assert.strictEqual(x.revokeReason,'جهاز مشبوه');assert.strictEqual(r.log.length,1);assert.strictEqual(JSON.stringify(s),snap);
  throwsMsg(()=>S.revokeSession(r.sessions,r.log,'ss2',{note:'مرة أخرى'}),'Session not active');
});
test('alerts sort by severity then newest and do not mutate',()=>{
  const a=S.buildAlerts(),snap=JSON.stringify(a),s=S.sortAlerts(a),rk={critical:4,high:3,medium:2,low:1};
  for(let i=1;i<s.length;i++)assert(rk[s[i-1].severity]>rk[s[i].severity]||(rk[s[i-1].severity]===rk[s[i].severity]&&Date.parse(s[i-1].at)>=Date.parse(s[i].at)));
  assert.strictEqual(JSON.stringify(a),snap);
});
test('grids: search and filters work on the real configs',()=>{
  const v=(cfg,rows,st)=>G.computeView(rows,cfg,Object.assign({search:'',filters:{},sort:null,page:1,pageSize:50},st));
  const A=S.buildAlerts().map(S.alertRow);assert.strictEqual(v(S.ALERT_CFG,A,{filters:{severity:'critical'}}).matched,1);
  assert.strictEqual(v(S.ALERT_CFG,A,{search:'192.0.2.77'}).matched,1);assert.strictEqual(v(S.ALERT_CFG,A,{search:'zzzz'}).matched,0);
  const L=S.buildLogins().map(S.attemptRow);assert.strictEqual(v(S.ATTEMPT_CFG,L,{filters:{result:'failed'}}).matched,L.filter(x=>x.result==='failed').length);
  const Q=S.buildSessions().map(S.sessionRow);assert.strictEqual(v(S.SESSION_CFG,Q,{filters:{status:'active'}}).matched,4);
});
test('no real security surface, network or storage; page states it is a demo',()=>{
  const src=fs.readFileSync(path.join(root,'apps/admin/pages/security.page.js'),'utf8');
  for(const k of Object.keys(S))assert.doesNotMatch(k,/^(send|notify|lock|ban|block|delete|remove|export|login|logout|authenticate|setPassword)/i,k);
  assert.doesNotMatch(src,/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|Blob\(|createObjectURL|navigator\.sendBeacon/);
  assert.match(src,/لا إنفاذ أمني حقيقي/);assert.match(src,/STATUS: IMPLEMENTED \(DEMO\)/);
});
console.log('security.test.js: '+passed+' checks');
