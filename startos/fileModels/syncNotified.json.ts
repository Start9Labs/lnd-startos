import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

// Dedicated file for the "have we already posted the Sync Complete
// notification" flag. Kept out of store.json so flipping it doesn't fire the
// const watch on store.json and restart main.
export const syncNotifiedFile = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/sync-notified.json',
  },
  z.object({
    notified: z.boolean().catch(false),
  }),
)
