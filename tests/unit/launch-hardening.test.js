'use strict';
/* Launch hardening: the server runs on the published catalogue (served governorates enforced on order creation, the
   AI / call centre see the owner's services), the chat cancel fee must match the amount the customer agreed to, the
   per-network chat quota counts signed-in sends only, and the session callable has room for the AI chat. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const runtime = require('../../functions/src/runtime.js');

function published(mut) {
  const env = runtime.createContext(null, []);
  const d = JSON.parse(JSON.stringify(env.run('CAT.db()')));
  mut(d);
  return JSON.stringify({ ...d, rev: 7, publishedAt: new Date().toISOString() });
}

test('server contexts start from the published catalogue and refresh it at most every 5 minutes', async () => {
  let reads = 0;
  const backend = { getDoc: async () => { reads++; return { json: published((d) => { d.items.find((i) => i.id === 'carpentry/doors').name = 'أبواب خشب'; }) }; } };
  runtime.invalidateCatalog();
  await runtime.refreshCatalog(backend); await runtime.refreshCatalog(backend);
  assert.equal(reads, 1, 'cached between calls');
  assert.equal(runtime.createContext(null, []).run("CAT.item('carpentry/doors').name"), 'أبواب خشب');
  runtime.setPublishedCatalog('');
  assert.equal(runtime.createContext(null, []).run("CAT.item('carpentry/doors').name"), 'أبواب', 'built-in catalogue without a published one');
});

test('orders from a governorate the owner does not serve are refused by the server', async () => {
  runtime.setPublishedCatalog(published((d) => { d.govs = ['الجيزة']; }));
  try {
    const env = runtime.createContext(null, []);
    const c = env.run("MP.customerFor('عميل','01012345678')");
    const body = { cat: 'carpentry', serviceName: 'أبواب', itemId: 'carpentry/doors', gov: 'القاهرة', area: 'مدينة نصر', addr: 'ش 1', phone: '01012345678', name: 'عميل' };
    const actor = { role: 'customer', id: c.id };
    const no = await env.client.request('POST', '/requests', { body, actor });
    assert.equal(no.ok, false); assert.match(JSON.stringify(no.error), /مش متاحين/);
    const yes = await env.client.request('POST', '/requests', { body: { ...body, gov: 'الجيزة' }, actor });
    assert.equal(yes.ok, true, JSON.stringify(yes.error));
  } finally { runtime.setPublishedCatalog(''); }
});

test('cancel fee: the chat sends the agreed amount, and a changed fee is asked again', () => {
  const gw = fs.readFileSync(path.join(ROOT, 'functions/src/agent-gateway.js'), 'utf8');
  assert.match(gw, /typeof body\.confirmFee === 'number' && body\.confirmFee === fee/);
  const chat = fs.readFileSync(path.join(ROOT, 'functions/src/support-chat.js'), 'utf8');
  assert.match(chat, /confirmFee: d\.fee > 0 \? \+d\.fee : false/);
});

test('chat quota per network counts signed-in sends only; session callable allows 120 s; customer app escapes names', () => {
  const svc = fs.readFileSync(path.join(ROOT, 'functions/src/service.js'), 'utf8');
  assert.match(svc, /d\.action === 'send' && token && !chatIpAllow\(ip\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8'), /TIMEOUTS = \{ session: 120 \}/);
  assert.match(fs.readFileSync(path.join(ROOT, 'services/firebase-backend.js'), 'utf8'), /httpsCallable\(fns, 'session', \{ timeout: 125000 \}\)/);
  const app = fs.readFileSync(path.join(ROOT, 'apps/customer/app.js'), 'utf8');
  for (const raw of ['<span class="tx">${s.name}</span>', '<h4>${p.t}</h4>', '<span>${p.warn}</span>', '<h3>${d.name}</h3>']) assert.ok(!app.includes(raw), 'unescaped: ' + raw);
});
