/**
 * Customer request-create page (route level). Entry point for the `#/request[/<catalogId>]` deep link into the
 * existing Request Wizard (pages/request-wizard.page.js). It resolves a catalog target — a category, item or problem
 * id from CAT — and opens the wizard through its own `startRequest()`, preselecting exactly as the in-app catalog
 * shortcuts do (`data-wz-hit`). It never re-implements wizard steps, validation or submission.
 */
'use strict';
(function(root){
  const TARGET_RE = /^[a-z0-9_-]+(?:\/[a-z0-9_-]+){0,2}$/i;

  /**
   * resolve(target, CAT) → {cat, item?, problem?} for a known, active catalog id; {} for empty/unknown/malformed.
   * Problems need item+category; items need their category.
   */
  function resolve(target, CAT) {
    const id = String(target || '').trim();
    if (!id || !TARGET_RE.test(id) || !CAT) return {};
    const p = typeof CAT.problem === 'function' ? CAT.problem(id) : null;
    if (p && p.active !== false) return { cat: p.cat, item: p.item, problem: id };
    const i = typeof CAT.item === 'function' ? CAT.item(id) : null;
    if (i && i.active !== false) return { cat: i.cat, item: id };
    const c = typeof CAT.category === 'function' ? CAT.category(id) : null;
    if (c && c.active !== false) return { cat: id };
    return {};
  }

  /**
   * open(target, deps) — deps: {CAT, startRequest, getWizard, show}. Starts a fresh wizard; for a problem it jumps to
   * the same step the catalog problem shortcut uses (3) and re-renders so that step is what the user sees.
   * Returns the resolved selection ({} = blank wizard).
   */
  function open(target, deps = {}) {
    const { CAT, startRequest, getWizard, show } = deps;
    if (typeof startRequest !== 'function') throw new Error('HSCustomerRequestCreate: startRequest dependency missing');
    const sel = resolve(target, CAT);
    startRequest(sel.cat, sel.item);
    if (sel.problem && typeof getWizard === 'function') {
      const w = getWizard();
      if (w) { w.problem = sel.problem; w.unknown = false; w.step = 3; if (typeof show === 'function') show('wizard'); }
    }
    return sel;
  }

  root.HSCustomerRequestCreate = Object.freeze({ resolve, open, TARGET_RE });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HSCustomerRequestCreate;
})(typeof globalThis !== 'undefined' ? globalThis : this);
