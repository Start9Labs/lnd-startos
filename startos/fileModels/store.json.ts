import { FileHelper, matches } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const { arrayOf, object, string, natural, boolean } = matches

export const shape = object({
  aezeedCipherSeed: arrayOf(string).nullable(),
  walletPassword: string,
  recoveryWindow: natural,
  bitcoindSelected: boolean,
  restore: boolean,
  resetWalletTransactions: boolean,
  watchtowers: arrayOf(string),
  walletInitialized: boolean,
  externalGateway: string.nullable().onMismatch(null),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
