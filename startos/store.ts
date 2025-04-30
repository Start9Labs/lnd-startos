import { setupExposeStore, utils } from '@start9labs/start-sdk'
import { randomPassword } from './utils'

export type Store = {
  aezeedCipherSeed: string[] | null
  walletPassword: string
  recoveryWindow: number | null | undefined
  bitcoindSelected: boolean
  restore: boolean
  resetWalletTransactions: boolean,
}

export const initStore: Store = {
  aezeedCipherSeed: null,
  walletPassword: utils.getDefaultString(randomPassword),
  recoveryWindow: 2_500,
  bitcoindSelected: false,
  restore: false,
  resetWalletTransactions: false,
}

export const exposedStore = setupExposeStore<Store>(() => [])
