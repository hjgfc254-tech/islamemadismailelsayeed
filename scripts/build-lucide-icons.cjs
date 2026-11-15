/* Build-time Lucide extraction: maps every existing icon name of shared/icons/icon-registry.js to a Lucide icon
   (lucide@0.460.0, ISC) and appends the path data as an override block. No runtime dependency. */
const vm = require('vm'), fs = require('fs');
const [, , lucidePath, registryPath] = process.argv;
const ctx = {}; ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(lucidePath, 'utf8'), ctx);
const ICONS = ctx.lucide.icons;
const pascal = k => k.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
const MAP = {
  home: 'house', search: 'search', grid: 'layout-grid', list: 'list', user: 'user-round', heart: 'heart', settings: 'settings', bell: 'bell',
  menu: 'menu', chev: 'chevron-left', back: 'arrow-right', plus: 'plus', trash: 'trash-2', edit: 'pencil', save: 'save', share: 'share-2',
  send: 'send', inbox: 'inbox', camera: 'camera', 'image-up': 'image-up', 'file-up': 'file-up', open: 'external-link', close: 'x',
  tick: 'check', check: 'circle-check', cancel: 'circle-x', filter: 'sliders-horizontal', sort: 'arrow-up-down', logout: 'log-out',
  info: 'info', warn: 'triangle-alert', shield: 'shield-check', clock: 'clock', power: 'power', dots: 'ellipsis', book: 'book-open',
  medal: 'award', key: 'key-round', bulb: 'lightbulb', provider: 'hard-hat', admin: 'shield-ellipsis', pin: 'map-pin', star: 'star',
  call: 'phone', chat: 'message-circle', wallet: 'wallet', earnings: 'banknote', calendar: 'calendar-days',
  'st-new': 'file-plus-2', 'st-search': 'search', 'st-sent': 'send', 'st-accepted': 'handshake', 'st-sched': 'calendar-check',
  'st-enroute': 'truck', 'st-arrived': 'map-pin-check-inside', 'st-working': 'hammer', 'st-quote': 'receipt-text', 'st-done': 'badge-check',
  'st-closed': 'archive', 'st-cancelled': 'ban', 'st-failed': 'octagon-x', 'st-dispute': 'scale',
  'c-electric': 'zap', 'c-plumbing': 'shower-head', 'd-pipes': 'spline', 'p-broken': 'unlink', 'p-jam': 'octagon-pause', 'p-vibration': 'vibrate', 'c-carpentry': 'hammer', 'c-painting': 'paint-roller', 'c-cars': 'car', 'c-cleaning': 'spray-can', 'c-appliances': 'washing-machine',
  'd-fridge': 'refrigerator', 'd-washer-auto': 'washing-machine', 'd-washer-semi': 'washing-machine', 'd-ac': 'air-vent', 'd-heater-electric': 'heater',
  'd-heater-gas': 'flame', 'd-dishwasher': 'utensils', 'd-deep-freezer': 'snowflake', 'd-microwave': 'microwave', 'd-cooker': 'cooking-pot',
  'd-hood': 'wind', 'd-other': 'package', 'd-wiring': 'cable', 'd-dist-board': 'circuit-board', 'd-switches': 'toggle-right', 'd-lighting': 'lamp-ceiling',
  'd-fans': 'fan', 'd-elec-heaters': 'heater', 'd-cables': 'cable', 'd-electrical-devices': 'plug-zap', 'd-faucets': 'droplet', 'd-sinks': 'bath',
  'd-toilet': 'toilet', 'd-siphon': 'pipette', 'd-heaters-plumb': 'thermometer', 'd-sewage': 'waves', 'd-water-tanks': 'container', 'd-pumps': 'gauge',
  'd-doors': 'door-closed', 'd-windows': 'app-window', 'd-wardrobes': 'archive', 'd-kitchens': 'chef-hat', 'd-furniture': 'armchair',
  'd-chairs-tables': 'armchair', 'd-hinges-locks': 'lock-keyhole', 'd-assemble': 'drill', 'd-room': 'bed-double', 'd-full-apartment': 'building',
  'd-facades': 'building-2', 'd-ceilings': 'panel-top', 'd-damp': 'cloud-rain', 'd-cracks': 'zap-off', 'd-wallpaper': 'wallpaper', 'd-decor-paint': 'palette',
  'd-engine': 'cog', 'd-brakes': 'disc', 'd-battery': 'battery-charging', 'd-car-electric': 'plug-zap', 'd-car-ac': 'snowflake', 'd-tires': 'circle-dot',
  'd-gearbox': 'settings-2', 'd-suspension': 'spline', 'd-oil-change': 'fuel', 'd-towing': 'truck', 'd-apartments': 'building', 'd-villas': 'house',
  'd-offices': 'briefcase', 'd-sofas': 'sofa', 'd-carpets': 'layers', 'd-mattresses': 'bed', 'd-kitchens-clean': 'chef-hat', 'd-bathrooms': 'shower-head',
  'd-tanks-clean': 'container', 'd-post-finishing': 'paintbrush',
  wrench: 'wrench', bolt: 'zap', phone: 'smartphone', laptop: 'laptop', tv: 'tv', screen: 'monitor', battery: 'battery', wifi: 'wifi', sun: 'sun',
  snow: 'snowflake', flame: 'flame', heat: 'thermometer-sun', sound: 'volume-2', drop: 'droplet', saw: 'axe', hinge: 'link-2', drawer: 'archive',
  brush: 'paintbrush', broom: 'brush', sparkle: 'sparkles', plug: 'plug', fan: 'fan', tap: 'droplets',
  'p-leak': 'droplets', 'p-power-off': 'power-off', 'p-motor': 'cog', 'p-noise': 'volume-2', 'p-no-cool': 'snowflake', 'p-no-heat': 'thermometer-snowflake',
  'p-overheat': 'thermometer-sun', 'p-clog': 'circle-slash', 'p-smell': 'wind', 'p-gas': 'flame', 'p-spark': 'zap', 'p-install': 'wrench',
  'p-replace': 'refresh-cw', 'p-clean': 'sparkles', 'p-deep-clean': 'spray-can', 'p-paint': 'paint-roller', 'p-dead': 'battery-warning', 'p-board': 'circuit-board',
  'p-pressure': 'gauge', 'p-weak': 'signal-low', 'p-flicker': 'lightbulb-off', 'p-remote': 'tv-minimal', 'p-timer': 'timer', 'p-diagnose': 'stethoscope',
  'p-sterilize': 'shield-plus', 'p-dust': 'wind', 'p-vehicle': 'car', 'p-service': 'wrench'
};
const src = fs.readFileSync(registryPath, 'utf8');
const names = [...new Set([...src.matchAll(/^(?:X\('|ICON_DEFS\[')([\w-]+)'/gm)].map(m => m[1]))]; // X('…') and direct ICON_DEFS['…'] = definitions
const missingMap = names.filter(n => !MAP[n]);
const missingLucide = Object.entries(MAP).filter(([, l]) => !ICONS[pascal(l)]).map(([n, l]) => n + '→' + l);
if (missingMap.length || missingLucide.length) { console.log('MISSING MAP:', missingMap.join(' ')); console.log('MISSING LUCIDE:', missingLucide.join(' ')); process.exit(1); }
const esc = v => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const nodeToSvg = ([tag, attrs]) => '<' + tag + Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => ` ${k}="${esc(v)}"`).join('') + '/>';
const data = {};
for (const n of names) data[n] = ICONS[pascal(MAP[n])][2].map(nodeToSvg).join('');
const marker = '/* ───────── LUCIDE OVERRIDE (V9 design) ─────────';
const block = `${marker}
   Every icon name above now renders as its Lucide equivalent (lucide@0.460.0, ISC License, https://lucide.dev),
   extracted at build time (no runtime library). Single stroke layer; colour = currentColor; motion personalities off.
   Names, aliases and helpers are unchanged, so existing icon call sites keep working. Regenerate with the build script
   documented in docs/DESIGN_SYSTEM_V9.md. */
const LUCIDE_ICONS = ${JSON.stringify(data)};
for (const n of Object.keys(LUCIDE_ICONS)) ICON_DEFS[n] = { b: LUCIDE_ICONS[n], mo: '' };
`;
let out = src;
const i = out.indexOf(marker);
if (i >= 0) { const j = out.indexOf('\n`;', i); out = out.slice(0, i) + out.slice(out.indexOf('ICON_DEFS[n] = { b: LUCIDE_ICONS[n], mo: \'\' };\n', i) + 'ICON_DEFS[n] = { b: LUCIDE_ICONS[n], mo: \'\' };\n'.length); void j; }
const anchor = out.indexOf('const _build = n =>');
const sectionStart = out.lastIndexOf('/*', anchor);
out = out.slice(0, sectionStart) + block + '\n' + out.slice(sectionStart);
fs.writeFileSync(registryPath, out);
console.log('mapped', names.length, 'icons to', new Set(Object.values(MAP)).size, 'distinct Lucide icons; block bytes', block.length);
