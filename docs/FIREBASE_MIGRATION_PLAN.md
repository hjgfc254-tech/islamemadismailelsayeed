# HANSALEHLAK — production data migration plan (browser data → Firestore)

**Status:** NOT executed. Run it only after the first owner exists and the owner explicitly decides to migrate.

## What gets migrated
The local database of one browser: localStorage `hs_mp_db`, backed up as `hs_mp_db_backup_before_firebase` on the
first firebase-mode load.

**Migrated collections:** customers, providers, requests (MP `serviceRequests`), assignments, transactions, reviews,
complaints, notifications, addresses, quotes, favorites, serviceAreas, and `meta.lastReqNo`.

**Never migrated:**
- drafts and searchHistory (device-local);
- attachment files (Storage is deferred; ids only);
- records marked `demo: true`, which covers all seeded demo providers, unless `includeDemo` is explicitly passed;
- employees: the Admin workforce is managed server-side.

## Safeguards already in place
| Safeguard | State |
|---|---|
| Firestore Point-in-Time Recovery | **ENABLED** (7-day version retention; earliest version 2026-11-15T10:01Z) |
| Firestore Delete Protection | **ENABLED** |
| Owner-only import | `session.importLocal` requires an active `owner` in `admins/{uid}` |
| Additive and idempotent | Existing document ids are skipped, never overwritten; re-running adds nothing (tested in the emulator) |
| Dry run | `dryRun: true` writes nothing (tested in the emulator) |
| Rollback list | Each real import writes a `migrations/{auto}` record with `addedIds` per Firestore collection (opaque ids only, no personal data) |
| Size cap | 5,000 records per import (larger sets must be split) |

## Procedure
1. **Preconditions.** The owner account exists: the owner signs in to the Admin app with `?backend=firebase`, verifies
   the email, and becomes owner through the bootstrap.
2. **Record the restore point.** Note the current UTC time `T0`. PITR can restore the database to any minute after
   the earliest version time.
3. **Dry run.** In the browser that holds the data (Admin app, owner signed in), run in the console:
   `await HSBackend.importLocal(true)`. Then review `report.added`, `report.skippedExisting`, `report.skippedDemo`,
   `report.invalid` and `report.addedIds`.
4. **Expected counts.** `report.added` must equal the number of non-demo local records per collection. The current
   production database is empty: verified on 2026-11-15, an anonymous sync returned 0 providers and 0 customers. So
   the first import should show `skippedExisting` empty, `skippedDemo.providers` equal to the demo seed count (7), and
   `invalid` empty. Stop if anything differs.
5. **Import.** Run `await HSBackend.importLocal(false)`, then keep the returned report.
6. **Verify.**
   - Admin summary counts (`GET /admin/summary`) match the report.
   - Spot-check 3 requests in the Admin orders page.
   - A second `importLocal(true)` shows everything under `skippedExisting`.

## Rollback
- **Targeted:** delete exactly the documents listed in the `migrations` record (`addedIds.<collection>`). Use an Admin
  SDK script run by the owner, or the Firebase console. Nothing else was written by the import, except
  `system/meta.lastReqNo`, which is only ever raised.
- **Full:** restore the database to `T0` with Firestore PITR (Firestore → Disaster recovery → restore to a new
  database or the same one as documented). Then redeploy rules and indexes if restoring into a new database.

**Local data is never deleted by the migration.** The browser keeps `hs_mp_db_backup_before_firebase`.
