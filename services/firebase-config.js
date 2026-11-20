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
 */
'use strict';
(function (root) {
  const DEFAULT_MODE = 'firebase';   /* production backend; ?backend=local (remembered) selects the offline demo for development/tests */
  const web = Object.freeze({
    apiKey: 'AIzaSyDDI0YfY28KQwFEumo9fuFm10uzRj5-Fk8',
    authDomain: 'hansalahlak.firebaseapp.com',
    databaseURL: 'https://hansalahlak-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'hansalahlak',
    appId: '1:1015279981316:web:da97181c9445c51f59f651',
    messagingSenderId: '1015279981316'
  });
  const read = k => { try { return root.localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { root.localStorage.setItem(k, v); } catch {} };
  let params = null;
  try { params = new URLSearchParams(root.location.search); } catch { params = null; }
  const asked = params && params.get('backend');
  if (asked === 'firebase' || asked === 'local') write('hs_backend', asked);
  const emu = params && params.get('emulators');
  if (emu === '1' || emu === '0') write('hs_emulators', emu);
  const mode = read('hs_backend') === 'firebase' || read('hs_backend') === 'local' ? read('hs_backend') : DEFAULT_MODE;
  root.HSFirebaseConfig = Object.freeze({
    web, mode, region: 'me-central1', sdkVersion: '13.1.0',
    /* App Check (reCAPTCHA v3 site key from Console › App Check). Empty = off. After setting it, vendor
       firebase-app-check.js 13.1.0 next to the other SDK files and set ENFORCE_APP_CHECK=true in functions/.env. */
    appCheckSiteKey: '',
    /* Web Push (FCM) public VAPID key — public by design (identifies the sender; it cannot send anything) */
    vapidKey: 'BA1uWhLcPjtLTSCU0d1yjVcrNALmpMG1SRm9P0O9KpfRcwQ78vtTYWFno5_EO31d83syWa-DtkL6byU6W2L3ycU',
    emulators: read('hs_emulators') === '1' ? { host: '127.0.0.1', auth: 9099, functions: 5001, database: 9000 } : null
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
