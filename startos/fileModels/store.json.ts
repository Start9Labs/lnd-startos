import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  walletPassword: z.string(),
  aezeedCipherSeed: z.array(z.string()).nullable().catch(null),
  restore: z.boolean().catch(false),
  resetWalletTransactions: z.boolean().catch(false),
  watchtowerClients: z.array(z.string()).catch([]),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
