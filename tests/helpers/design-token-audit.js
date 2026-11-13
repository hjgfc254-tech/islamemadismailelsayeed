'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const ADMIN_CSS_FILES = [
  'apps/admin/styles/admin.css',
  'apps/admin/styles/admin-components.css',
  'apps/admin/styles/admin-responsive.css',
];
const AUDIT_FILES = [
  ...ADMIN_CSS_FILES,
  'apps/customer/styles/customer.css',
  'apps/provider/styles/provider.css',
];

const COLOR_RE = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi;
const DIMENSION_RE = /(?<![\w.-])-?\d+(?:\.\d+)?(?:px|rem|em|vw|vh|dvh|svh|lvh)\b/gi;
const SPACING_PROPERTIES = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-inline', 'margin-inline-start', 'margin-inline-end',
  'margin-block', 'margin-block-start', 'margin-block-end',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-inline-start', 'padding-inline-end',
  'padding-block', 'padding-block-start', 'padding-block-end',
  'gap', 'row-gap', 'column-gap', 'inset', 'inset-block', 'inset-inline',
  'top', 'right', 'bottom', 'left', 'width', 'height', 'min-width',
  'max-width', 'min-height', 'max-height', 'flex-basis',
]);
const RADIUS_PROPERTIES = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
]);
const SHADOW_PROPERTIES = new Set(['box-shadow', 'text-shadow']);

function readDeclarations(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = [];
  // Each innermost block is parsed independently, so @media query conditions
  // (which are not declarations) are never counted as CSS values.
  for (const block of withoutComments.matchAll(/\{([^{}]*)\}/g)) {
    for (const raw of block[1].split(';')) {
      const colon = raw.indexOf(':');
      if (colon < 1) continue;
      const property = raw.slice(0, colon).trim().toLowerCase();
      const value = raw.slice(colon + 1).trim();
      if (!property || property.startsWith('--') || property.startsWith('@')) continue;
      declarations.push({ property, value });
    }
  }
  return declarations;
}

function scanCssFile(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const counts = { colors: 0, spacing: 0, radius: 0, fontSize: 0, shadows: 0, zIndex: 0 };
  for (const { property, value } of readDeclarations(source)) {
    counts.colors += (value.match(COLOR_RE) || []).length;
    if (SPACING_PROPERTIES.has(property)) counts.spacing += (value.match(DIMENSION_RE) || []).length;
    if (RADIUS_PROPERTIES.has(property)) counts.radius += (value.match(DIMENSION_RE) || []).length;
    if (property === 'font-size') counts.fontSize += (value.match(DIMENSION_RE) || []).length;
    if (SHADOW_PROPERTIES.has(property) && value.toLowerCase() !== 'none') counts.shadows += 1;
    if (property === 'z-index' && !/^(?:var|calc)\(/.test(value)) counts.zIndex += 1;
  }
  return counts;
}

function sumCounts(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function scanProjectStyles() {
  const files = Object.fromEntries(AUDIT_FILES.map((file) => [file, scanCssFile(file)]));
  const totals = Object.values(files).reduce((sum, item) => {
    for (const [key, value] of Object.entries(item)) sum[key] += value;
    return sum;
  }, { colors: 0, spacing: 0, radius: 0, fontSize: 0, shadows: 0, zIndex: 0 });
  const admin = Object.fromEntries(ADMIN_CSS_FILES.map((file) => [file, files[file]]));
  const adminTotals = Object.values(admin).reduce((sum, item) => {
    for (const [key, value] of Object.entries(item)) sum[key] += value;
    return sum;
  }, { colors: 0, spacing: 0, radius: 0, fontSize: 0, shadows: 0, zIndex: 0 });
  return { files, totals, adminTotals, adminHardcodedCount: sumCounts(adminTotals) };
}

module.exports = {
  ADMIN_CSS_FILES,
  AUDIT_FILES,
  readDeclarations,
  scanCssFile,
  scanProjectStyles,
  sumCounts,
};
