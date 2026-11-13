/**
 * MODULE: audit-filters — HSAdminAuditFilters
 * Search and filter configuration for the Admin audit-log grid (module, result, actor filters; searchable fields).
 * HSDataGrid performs the filtering; this module owns which fields are searchable/filterable and the result options.
 * Extracted from pages/audit-log.page.js (same behavior). Demo events only — not a tamper-proof audit store.
 * STATUS: IMPLEMENTED (FRONTEND DEMO)
 */
'use strict';
(function (root) {
  const SEARCH_KEYS = Object.freeze(['actor', 'action', 'record', 'summary', 'moduleLabel']);

  /** Filter definitions for HSDataGrid; `result` options come from the page's RESULT map ({key:{label}}). */
  const filters = (RESULT) => [
    { key: 'moduleLabel', label: 'الوحدة' }, { key: 'result', label: 'النتيجة', options: Object.keys(RESULT || {}).map((k) => ({ value: k, label: RESULT[k].label })) }, { key: 'actor', label: 'المنفّذ' }
  ];

  /** Full grid configuration for the audit page: columns + search keys + filters. */
  const gridConfig = (columns, RESULT) => ({ columns, searchKeys: SEARCH_KEYS.slice(), filters: filters(RESULT) });

  const api = Object.freeze({ SEARCH_KEYS, filters, gridConfig });
  root.HSAdminAuditFilters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
