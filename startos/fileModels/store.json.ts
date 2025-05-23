import { FileHelper, matches } from '@start9labs/start-sdk'

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
})

export const storeJson = FileHelper.json(
  '/media/startos/volumes/main/store.json',
  shape,
)
