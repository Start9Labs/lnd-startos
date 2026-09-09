import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Written only by main's unlock oneshot, so no action's write can race it.
// Excluded from the StartOS backup: it describes this lifecycle of this node.
export const unlockStatusShape = z.object({
  // True once this lifecycle's unlock oneshot itself opened the wallet with the
  // stored password; false from the moment the oneshot starts until then.
  storedPasswordVerified: z.boolean().catch(false),
  // True once LND has refused the stored password in this lifecycle; offers
  // Unlock Wallet as the way to replace it.
  storedPasswordRefused: z.boolean().catch(false),
})

export const unlockStatusJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: '/unlock-status.json' },
  unlockStatusShape,
)
