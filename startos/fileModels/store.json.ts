import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  walletPassword: z.string(),
  aezeedCipherSeed: z.array(z.string()).nullable().catch(null),
  watchtowerClients: z.array(z.string()).catch([]),
  customExternalHosts: z.array(z.string()).catch([]),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
