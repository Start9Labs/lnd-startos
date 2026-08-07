import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// One-time startup flags: flipped by an action (or the restore hook), consumed
// by main at startup, then flipped back once the corresponding startup work is
// done. Kept OUT of store.json on purpose — store.json is read in main with a
// `.const` watch that restarts main on any change, so clearing a flag there
// would loop / force a needless restart (this is exactly the bug that made the
// Reset Wallet Transactions action re-run on every restart). This file is read
// with `.once`, so flipping these never triggers a restart; any restart is
// driven explicitly by the action via sdk.restart.
export const startupFlagsJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/startup-flags.json',
  },
  z.object({
    resetWalletTransactions: z.boolean().catch(false),
    restore: z.boolean().catch(false),
    notified: z.boolean().catch(false),
    // Set by the Revoke Macaroons action. Consumed by the unlock-wallet
    // oneshot, which unlocks via /v1/changepassword with new_macaroon_root_key
    // instead of /v1/unlockwallet — the only supported way to rotate the root
    // key, which is what actually revokes (see the action).
    rotateMacaroonRootKey: z.boolean().catch(false),
    // bolt → SQLite migration progress (persistent, like `notified`).
    //   dbSchemaFinalized — LND has been run on bolt to apply pending schema
    //     migrations, so a resumed conversion skips that step.
    //   dbMigrationComplete — the full conversion finished; once set, the
    //     migrate init step no longer runs a conversion.
    // Kept here (read with `.once`) so writing them never trips main's
    // store/lnd.conf `.const` watches — the conversion completes with no restart.
    dbSchemaFinalized: z.boolean().catch(false),
    dbMigrationComplete: z.boolean().catch(false),
  }),
)
