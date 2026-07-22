import { sdk } from '../sdk'
import { needsSqliteMigration, runSqliteMigration } from '../sqliteBackend'

// Convert a pre-0.21 bolt database to SQLite before LND ever runs, as a blocking
// init step rather than a daemon in `main` — so by the time the service starts,
// the node is already on SQLite and `main` has nothing migration-specific to do.
//
// `needsSqliteMigration()` is a no-op check (a couple of stat calls + a flag
// read) on fresh installs (born on SQLite) and on every start after the
// conversion, so this stays out of the way on the normal path. When it does run,
// `runSqliteMigration` drives the conversion through temporary `runUntilSuccess`
// daemon chains (see sqliteBackend.ts) and blocks init until it succeeds,
// reporting each stage to the init progress UI. The work is resumable, so an
// interrupted run continues on the next init.
export const migrateSqlite = sdk.setupOnInit(
  async (effects, _kind, progress) => {
    if (!(await needsSqliteMigration())) return
    await runSqliteMigration(effects, progress)
  },
)
