/**
 * MODULE: mini-charts (HSMiniCharts) — small, dependency-free single-series bar charts for the Admin dashboard.
 * Dataviz rules applied: one series → one hue (copper, validated ≥3:1 on the card surface), no legend box (the title
 * names the series), thin bars with 4px rounded data-ends on a recessive baseline, 2px gaps, a per-bar hover/focus
 * tooltip, one selective direct label (the peak), and a table view for screen readers / exact values.
 */
'use strict';
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = n => { try { return new Intl.NumberFormat('ar-EG').format(n); } catch (e) { return String(n); } };
  const dayKey = d => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10); };
  const dayLabel = k => { try { return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(new Date(k + 'T12:00:00')); } catch (e) { return k; } };

  /** Bucket items into the last `days` calendar days: value(item) summed per day (count when value is omitted). */
  function daily(items, days, at, value) {
    const keys = []; const now = new Date();
    for (let i = days - 1; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); keys.push(d.toISOString().slice(0, 10)); }
    const sums = Object.fromEntries(keys.map(k => [k, 0]));
    for (const it of items || []) { const k = dayKey(at(it)); if (k in sums) sums[k] += value ? (+value(it) || 0) : 1; }
    return keys.map(k => ({ key: k, label: dayLabel(k), value: Math.round(sums[k] * 100) / 100 }));
  }

  /** {id, title, unit, points:[{label,value}], fmt} → accessible chart HTML. */
  function bars({ id, title, unit = '', points, fmt = nf }) {
    const max = Math.max(0, ...points.map(p => p.value));
    const total = points.reduce((a, p) => a + p.value, 0);
    const peak = max > 0 ? points.reduce((b, p, i) => (p.value > points[b].value ? i : b), 0) : -1;
    const val = v => fmt(v) + (unit ? ' ' + unit : '');
    return `<figure class="mc" aria-labelledby="${esc(id)}-t">
      <figcaption id="${esc(id)}-t" class="mc-t"><b>${esc(title)}</b><small>الإجمالي: ${esc(val(total))}</small></figcaption>
      <div class="mc-plot" role="img" aria-label="${esc(title)} — آخر ${points.length} يوم، الإجمالي ${esc(val(total))}">
        <div class="mc-bars">${points.map((p, i) => `<span class="mc-col"><span class="mc-bar${p.value ? '' : ' is-zero'}" style="--h:${max ? Math.max(p.value ? 3 : 0, Math.round(p.value / max * 100)) : 0}%" tabindex="0" aria-label="${esc(p.label)}: ${esc(val(p.value))}" data-tip="${esc(p.label)} — ${esc(val(p.value))}">${i === peak ? `<em class="mc-peak">${esc(fmt(p.value))}</em>` : ''}</span></span>`).join('')}</div>
        <div class="mc-axis" aria-hidden="true"><span>${esc(points[0] ? points[0].label : '')}</span><span>${esc(points.length ? points[points.length - 1].label : '')}</span></div>
      </div>
      <details class="mc-table"><summary>عرض الأرقام كجدول</summary><table><thead><tr><th scope="col">اليوم</th><th scope="col">${esc(title)}</th></tr></thead><tbody>${points.map(p => `<tr><td>${esc(p.label)}</td><td>${esc(val(p.value))}</td></tr>`).join('')}</tbody></table></details>
    </figure>`;
  }

  const api = Object.freeze({ daily, bars });
  root.HSMiniCharts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);