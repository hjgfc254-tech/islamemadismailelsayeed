/**
 * Firestore naming for the marketplace database (used by partial.js and service.js).
 * One document per entity; collections are created by the first real write (no placeholder documents).
 *   MP key            → Firestore
 *   serviceRequests   → requests/{id}            (renamed for clarity)
 *   <array key>       → <key>/{id}               (customers, providers, assignments, transactions, reviews, complaints,
 *                                                  notifications, addresses, quotes, favorites, serviceAreas, jobPhotos)
 *   meta, settings    → system/meta, system/settings
 * Device-local collections (drafts, searchHistory, services) stay on the device and are never persisted server-side.
 * The former whole-database readAll / commit / firestoreAdapter were replaced by PartialDb (partial.js) and removed
 * (no runtime, test or documentation users remained).
 */
'use strict';
const crypto = require('crypto');

const RENAME = { serviceRequests: 'requests' };
const DEVICE_LOCAL = ['drafts', 'searchHistory', 'services'];
const KNOWN_ARRAYS = ['customers', 'providers', 'serviceRequests', 'assignments', 'transactions', 'reviews', 'complaints',
  'notifications', 'addresses', 'quotes', 'favorites', 'serviceAreas', 'jobPhotos'];   // jobPhotos: loaded on demand only (never in a sync)

const colName = key => RENAME[key] || key;
const safeId = s => String(s).replace(/\//g, '%2F').slice(0, 700);
function keyOf(key, item) {
  if (item && item.id != null && item.id !== '') return safeId(item.id);
  if (key === 'favorites') return safeId(`${item.customerId}__${item.kind}__${item.refId}`);
  if (key === 'serviceAreas') return safeId(item.gov);
  return crypto.createHash('sha1').update(JSON.stringify(item)).digest('hex');
}

module.exports = { keyOf, colName, KNOWN_ARRAYS, DEVICE_LOCAL, RENAME };
