import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.looseObject({
  // Null while Cold Storage Mode is on: the password is off the server and the
  // user supplies it at each start.
  walletPassword: z.string().nullable().catch(null),
  // Set before a changepassword call; adopted as walletPassword once a call opens the wallet with it.
  pendingWalletPassword: z.string().nullable().catch(null),
  aezeedCipherSeed: z.array(z.string()).nullable().catch(null),
  watchtowerClients: z.array(z.string()).catch([]),
  customExternalHosts: z.array(z.string()).catch([]),
  // Which service backs `bitcoin.node=bitcoind`. rbitcoin runs as LND's
  // bitcoind backend too, so lnd.conf cannot say which one it is.
  bitcoinNode: z.enum(['bitcoind', 'rbitcoin']).catch('bitcoind'),
  // Verbatim: the companion's task compares it byte for byte.
  clearnetVpn: z
    .looseObject({
      config: z.string(),
      announce: z.string().nullable().catch(null),
      skipProxyBefore: z.boolean().catch(true),
    })
    .nullable()
    .catch(null),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
