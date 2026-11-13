/**
 * MODULE: money
 * RESPONSIBILITY: Shared money/percent helpers for DEMO admin pages — whole Egyptian pounds, Arabic number formatting,
 *   and rate application with a single rounding rule. Pure functions; no currency conversion, no real accounting.
 * STATUS: IMPLEMENTED (DEMO). Extracted when the second finance page (commissions) needed the same formatter as the
 *   finance dashboard. Amounts are plain numbers of whole pounds; rates are percentages (12 = 12٪).
 * API: format(n) → "١٢٬٠٠٠ ج.م" · number(n) · percent(p) → "١٢٪" · applyRate(amount, ratePercent) → whole pounds (round half up,
 *   rate converted to hundredths of a percent first so 12.5٪ of 1000 is exactly 125) · isRate(p, max?) · RATE_MAX_DECIMALS
 */
'use strict';
(function (root) {
  const RATE_MAX_DECIMALS = 2;
  const num = (n) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };
  const number = (n, opts) => { try { return new Intl.NumberFormat('ar-EG', opts).format(num(n)); } catch (e) { return String(num(n)); } };
  const format = (n) => number(n) + ' ج.م';
  const percent = (p) => number(p, { maximumFractionDigits: RATE_MAX_DECIMALS }) + '٪';
  const applyRate = (amount, ratePercent) => Math.round(num(amount) * Math.round(num(ratePercent) * 100) / 10000);
  const isRate = (p, max) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= (max == null ? 100 : max)
    && Math.abs(p * 100 - Math.round(p * 100)) < 1e-9;
  const api = { format, number, percent, applyRate, isRate, RATE_MAX_DECIMALS };
  root.HSMoney = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
