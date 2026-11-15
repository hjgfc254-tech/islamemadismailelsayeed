/**
 * MODULE: notifications-api
 * RESPONSIBILITY: In-app notification inbox contract over services/api-client.js (mock handlers on MP). The inbox is
 *   derived from the caller's actor — `customer:<id>`, `provider:<id>` or the shared `admin` inbox — so no caller can
 *   read or clear another party's notifications. No push, SMS, e-mail or WhatsApp delivery exists.
 * ROUTES (customer|provider|admin):
 *   GET  /notifications          { items, unread }
 *   POST /notifications/read     mark all as read
 * STATUS: IMPLEMENTED (MOCK ADAPTER — local store only, no delivery channels, no network)
 */
'use strict';
(function (root, factory) {
  const client = root.HSApiClient || (typeof require === 'function' ? require('./api-client.js') : null);
  const api = factory(client);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HSNotificationsApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (client) {
  const ALL = ['customer', 'provider', 'admin'];
  /** Inbox key used by the store's notify(to, …). */
  const inboxOf = actor => (actor.role === 'admin' ? 'admin' : actor.role + ':' + actor.id);

  client.define('GET', '/notifications', { roles: ALL, summary: 'Own inbox and unread count.' }, ({ actor, store }) => {
    const to = inboxOf(actor);
    return { items: store.notesFor(to), unread: store.unreadFor(to) };
  });
  client.define('POST', '/notifications/read', { roles: ALL, summary: 'Mark own inbox as read.' }, ({ actor, store }) => {
    const to = inboxOf(actor);
    store.markRead(to);
    return { unread: store.unreadFor(to) };
  });

  return {
    inboxOf,
    list: () => client.get('/notifications'),
    markAllRead: () => client.post('/notifications/read')
  };
});
