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
  }),
)
