/**
 * MODULE: firebase-config — public Firebase web configuration + backend mode selection.
 * The web config below is PUBLIC by design (it identifies the project; access is enforced by Auth, the Functions'
 * server-side authorization, Firestore/RTDB security rules and, later, App Check). No secrets belong here.
 * Mode:
 *   'firebase' (default) every request goes to Cloud Functions; the local store is only a cache of the actor-scoped
 *              read model (never seeded with demo data)
 *   'local'    the offline demo backend (MP over localStorage) — used by development and all automated tests
 * Select with ?backend=firebase | ?backend=local (remembered in localStorage `hs_backend`). ?emulators=1 targets the
 * local Firebase Emulator Suite. DEFAULT_MODE is 'firebase' since the production activation (2026-11-15).
 * Environment (`env`): 'prod' everywhere except a *-staging host or localhost with ?env=staging → the staging project.
 */
'use strict';
(function (root) {
  const DEFAULT_MODE = 'firebase';   /* production backend; ?backend=local (remembered) selects the offline demo for development/tests */
  const prodWeb = Object.freeze({
    apiKey: 'AIzaSyDDI0YfY28KQwFEumo9fuFm10uzRj5-Fk8',
    authDomain: 'hansalahlak.firebaseapp.com',
    databaseURL: 'https://hansalahlak-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'hansalahlak',
    appId: '1:1015279981316:web:da97181c9445c51f59f651',
    messagingSenderId: '1015279981316'
  });
  const PROD_VAPID = 'BA1uWhLcPjtLTSCU0d1yjVcrNALmpMG1SRm9P0O9KpfRcwQ78vtTYWFno5_EO31d83syWa-DtkL6byU6W2L3ycU';
  /* STAGING (separate Firebase project `hansalahlak-staging`, .firebaserc alias `staging`). Paste the staging web app
     config from Console › Project settings › Your apps, and its Web Push key, in place of the PASTE_… placeholders
     (docs/MAINTENANCE_GUIDE.md §4.11). Public by design, like the production config. */
  const stagingWeb = Object.freeze({
    apiKey: 'PASTE_STAGING_API_KEY',
    authDomain: 'hansalahlak-staging.firebaseapp.com',
    databaseURL: 'https://hansalahlak-staging-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'hansalahlak-staging',
    appId: 'PASTE_STAGING_APP_ID',
    messagingSenderId: 'PASTE_STAGING_SENDER_ID'
  });
  const STAGING_VAPID = '';
  const read = k => { try { return root.localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { root.localStorage.setItem(k, v); } catch {} };
  let params = null;
  try { params = new URLSearchParams(root.location.search); } catch { params = null; }
  /* environment: a *-staging.web.app / *-staging.firebaseapp.com host is staging; on localhost / 127.0.0.1
     ?env=staging selects it (remembered in localStorage `hs_env`, ?env=prod clears it). Every other host is production. */
  let host = '';
  try { host = String(root.location.hostname || '').toLowerCase(); } catch { host = ''; }
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const askedEnv = params && params.get('env');
  if (isLocal && (askedEnv === 'staging' || askedEnv === 'prod')) write('hs_env', askedEnv);
  const env = /-staging\.(web\.app|firebaseapp\.com)$/.test(host) || (isLocal && read('hs_env') === 'staging') ? 'staging' : 'prod';
  const web = env === 'staging' ? stagingWeb : prodWeb;
  const asked = params && params.get('backend');
  if (asked === 'firebase' || asked === 'local') write('hs_backend', asked);
  const emu = params && params.get('emulators');
  if (emu === '1' || emu === '0') write('hs_emulators', emu);
  const mode = read('hs_backend') === 'firebase' || read('hs_backend') === 'local' ? read('hs_backend') : DEFAULT_MODE;
  root.HSFirebaseConfig = Object.freeze({
    web, env, mode, region: 'me-central1', sdkVersion: '13.1.0',
    /* App Check (reCAPTCHA v3 site key from Console › App Check). Empty = off. After setting it, vendor
       firebase-app-check.js 13.1.0 next to the other SDK files and set ENFORCE_APP_CHECK=true in functions/.env. */
    appCheckSiteKey: '',
    /* Web Push (FCM) public VAPID key — public by design (identifies the sender; it cannot send anything) */
    vapidKey: env === 'staging' ? STAGING_VAPID : PROD_VAPID,
    emulators: read('hs_emulators') === '1' ? { host: '127.0.0.1', auth: 9099, functions: 5001, database: 9000 } : null
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
