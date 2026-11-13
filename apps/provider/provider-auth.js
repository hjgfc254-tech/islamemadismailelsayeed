/* Demo account selector only. Production authentication must be supplied by a trusted backend. */
'use strict';
(function (root) {
  root.HSProviderAuth = Object.freeze({
    listDemoAccounts(MP) { return MP.db().providers.map(p => ({id:p.id,name:p.name,status:p.status,demo:!!p.demo,available:!!p.available})); },
    resolveDemoAccount(MP, id) { return MP.get('providers', id) || null; }
  });
})(globalThis);
