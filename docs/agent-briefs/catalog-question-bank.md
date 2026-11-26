# Brief: the default question bank (data only, one new file + one test)

Owner request (2026-11-26):
- Every service asks a few **simple Egyptian-Arabic questions with ready answers**. Example, door installation: «حلق الباب (الفريم) متركب؟» → أيوه / لا / مش عارف.
- The owner will later pick questions per service from this bank in the admin.

Use `Claude-Session: https://claude.ai/code/session_01W3TuWCKWoe3KxU6igeoy12`. Work in your worktree and commit there; never push or deploy.

**Keep it cheap and fast:**
- Read only `services/local-catalog.js` (the `DEF` table at about lines 320–420 lists every category / item / problem; `Q_SET_*`, `Q_BY_ITEM` and `Q_BY_PROBLEM` above it are the current questions, so reuse their good ones).
- Do not explore the rest of the repo, do not run browser runners, and do not edit any other file.

## Deliverable 1: `services/catalog-question-bank.js` (new)

A classic browser script (no imports), plus `module.exports` at the end:

```js
'use strict';
/* header comment: what it is, who reads it (services/local-catalog.js buildSeed → CAT.questionsFor) */
const HS_Q_BANK = [
  { id: 'door_frame', label: 'حلق الباب (الفريم) متركب؟', type: 'select', options: ['أيوه', 'لا', 'مش عارف'] },
  { id: 'car_make', label: 'نوع العربية والموديل والسنة', type: 'input' },
  { id: 'rooms_count', label: 'عدد الأوض', type: 'number' },
  // …
];
const HS_Q_ITEM = { 'carpentry/doors': [{ id: 'door_count', required: false }], /* every item id */ };
const HS_Q_PROBLEM = { 'carpentry/doors/install': [{ id: 'door_frame', required: false }, { id: 'door_ready', required: false }] };
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { HS_Q_BANK, HS_Q_ITEM, HS_Q_PROBLEM });
if (typeof module !== 'undefined') module.exports = { HS_Q_BANK, HS_Q_ITEM, HS_Q_PROBLEM };
```

**Rules:**
- **Ids:**
  - `id` is snake_case ASCII, unique, at most 32 characters;
  - item ids are `<cat>/<slug>` and problem ids are `<cat>/<slug>/<problemSlug>`, exactly as `buildSeed()` makes them from `DEF`.
- **Questions** — short, friendly Egyptian Arabic, a question a customer answers in one tap:
  - `select` with 2–4 options, preferably including «مش عارف» where it makes sense;
  - `number` only for counts and areas;
  - `input` only when unavoidable (the car model).
- **Per item:** at most 2 questions in `HS_Q_ITEM`.
- **Per problem:**
  - at most 2 questions in `HS_Q_PROBLEM`;
  - add them where they truly help the technician bring the right tools or parts, e.g. installs (frame there? wall type? who brings the part?), leaks (where? can you close the valve?), danger (smell of gas?, sparks?);
  - not every problem needs questions.
- **No generic noise:** no «متى بدأت المشكلة؟ / هل سبق إصلاحه؟» on every item.
- **`required: true` only:**
  - for the car model on every `cars/*` item (keep the bank id `make`, because a test expects it);
  - for `rooms` on `painting/full-apartment`.
  Everything else is `false`.
- **Coverage:** every item in `DEF` has a key in `HS_Q_ITEM` (an empty array is allowed); every referenced id exists in `HS_Q_BANK`; no unused bank entries.
- **Keep these existing ids:**
  - `area` (cleaning area) appears in `cleaning/apartments`;
  - `brand` and `pattern` appear in `appliances/washer-auto` (`brand` = الماركة, `pattern` = «العطل مستمر ولا بييجي ويروح؟»);
  - existing tests check these.

## Deliverable 2: `tests/unit/catalog-question-bank.test.js` (node:test)

- `require` the new file, and read the item / problem ids by loading `services/local-catalog.js` with `require` (it exports `CAT`).
- Assert:
  - the id format and uniqueness;
  - every select has 2–6 options;
  - every item is covered;
  - every reference exists, and there are no unused entries;
  - the limits (≤2 per item and per problem);
  - `cars/*` items have a required `make`;
  - `carpentry/doors/install` exists and asks `door_frame`.

  `carpentry/doors/install` («تركيب باب جديد») was just added to `DEF`.

## Finish

1. Run `node --test tests/unit/catalog-question-bank.test.js` (green), then commit:
   - message `feat(catalog): default question bank (simple one-tap questions per service)`;
   - trailers `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the Claude-Session line above.
2. Reply in Arabic in 5 lines at most: the branch, the commit, the number of bank questions, and 3 example questions.
