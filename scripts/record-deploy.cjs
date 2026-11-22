#!/usr/bin/env node
/**
 * Records which release was deployed, for the Tech Center («آخر نشر»). Run it right after `firebase deploy`:
 *     node scripts/record-deploy.cjs            (or: npm run deploy:record)
 * It writes system/deploy.release = { commit, cache, at, by: 'script' } with the Firebase Admin SDK, using the
 * credentials already on this computer — Application Default Credentials:
 *     gcloud auth application-default login          (once), or set GOOGLE_APPLICATION_CREDENTIALS to a key file
 * Nothing secret is read or printed. The functions themselves also record the deployed function revision and
 * the time it was first seen (healthClock), so the Tech Center shows a deploy time even if this script is skipped.
 * Never run against production from CI without review; it only writes one small document.
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8')).projects.default; } catch (e) { return ''; } })();
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; } };

(async () => {
  if (!PROJECT) { console.error('No Firebase project: set FIREBASE_PROJECT or keep .firebaserc.'); process.exit(1); }
  const commit = sh('git rev-parse --short HEAD'), dirty = sh('git status --porcelain') ? '+dirty' : '';
  let cache = ''; try { cache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'service-worker.lock.json'), 'utf8')).cache; } catch (e) {}
  let admin;
  try { admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin', 'app')); var fsm = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin', 'firestore')); }
  catch (e) { console.error('Install the functions dependencies first:  cd functions && npm ci'); process.exit(1); }
  try {
    admin.initializeApp({ projectId: PROJECT, credential: admin.applicationDefault() });
    const db = fsm.getFirestore();
    const release = { commit: commit + dirty, cache, at: new Date().toISOString(), by: 'script' };
    await db.doc('system/deploy').set({ release }, { merge: true });
    console.log(`Recorded release ${release.commit} (${cache}) for project ${PROJECT}`);
  } catch (e) {
    console.error('Could not write system/deploy: ' + (e && e.message ? e.message.split('\n')[0] : e));
    console.error('Run once:  gcloud auth application-default login   (or set GOOGLE_APPLICATION_CREDENTIALS)');
    process.exit(2);
  }
})();
