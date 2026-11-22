# Agent briefs (short task descriptions for helper agents)

Common rules for every brief:
- Work ONLY inside the worktree folder named in the brief (its own git branch). First `git merge main`.
- Read `CLAUDE.md` and the brief; locate code by search, read only what you need.
- After changes: `npm run functions:sync` (if `services/` changed), `npm run sw:bump`, `npm test` (100 % green),
  `npm run audit:refresh`; commit on the branch with a clear English message ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01W3TuWEnezupFkeAaUSVkZu`.
- Never push, never deploy, never touch production. Never put secrets in the repo.
- Final reply: short Arabic summary — branch, commit, what is done, what is left.
