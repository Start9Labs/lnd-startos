import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  // Null while Cold Storage Mode is on: the password is off the server and the
  // user supplies it at each start.
  walletPassword: z.string().nullable().catch(null),
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
