#!/usr/bin/env node
/**
 * Production deploy with a typed confirmation (npm run deploy:prod). Deploy to staging first (npm run deploy:staging).
 *   firebase deploy -P prod --only functions,hosting,firestore
 * It asks you to type the production project id; anything else aborts and nothing is deployed.
 * It never runs without a person at the keyboard: with no interactive terminal (CI, piped input) it refuses.
 */
'use strict';
const readline = require('readline');
const { spawn } = require('child_process');

const PROJECT = 'hansalahlak';
const ARGS = ['deploy', '-P', 'prod', '--only', 'functions,hosting,firestore'];

if (!process.stdin.isTTY) { console.error('deploy:prod needs an interactive terminal (typed confirmation). Nothing was deployed.'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`This deploys to PRODUCTION (${PROJECT}): firebase ${ARGS.join(' ')}`);
console.log('Did you deploy to staging first and check it? Run «npm test» and «npm run functions:check» before this.');
rl.question(`Type the project id «${PROJECT}» to continue: `, (answer) => {
  rl.close();
  if (String(answer).trim() !== PROJECT) { console.log('Not confirmed. Nothing was deployed.'); process.exit(1); }
  const child = spawn('firebase', ARGS, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    if (code === 0) console.log('Done. Now run «npm run deploy:record» and check the apps (docs/MAINTENANCE_GUIDE.md §4.2).');
    process.exit(code == null ? 1 : code);
  });
});
