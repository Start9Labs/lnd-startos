import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  walletPassword: z.string().nullable().catch(null),
  // A pending wallet password change, and the error from a failed one, live in
  // store.json (not startup-flags.json) exactly like the secure fork: main
  // reads store with a `.const` watch, so writing either triggers the service
  // restart that applies the change, and the actions read them reactively so
  // their enabled/disabled states stay in sync with the change in progress.
  pendingPasswordChange: z.string().nullable().catch(null),
  passwordChangeError: z.string().nullable().catch(null),
  aezeedCipherSeed: z.array(z.string()).nullable().catch(null),
  watchtowerClients: z.array(z.string()).catch([]),
  customExternalHosts: z.array(z.string()).catch([]),
  // Security group state. One-time flags (resetWalletTransactions, restore)
  // intentionally live in startup-flags.json, NOT here — store.json is read
  // with a `.const` watch in main that restarts the service on any change (see
  // AGENTS.md). The pending-password-change fields above are the one exception:
  // they belong here because the restart *is* the mechanism that applies the
  // change, and the actions need to reflect it.
  autoUnlockEnabled: z.boolean().catch(true),
  walletInitialized: z.boolean().catch(false),
  seedBackupConfirmed: z.boolean().catch(false),
  seedBackupIndices: z.array(z.number()).nullable().catch(null),
  passwordBackupConfirmed: z.boolean().catch(false),
  recoveryWindow: z.number().catch(2_500),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
