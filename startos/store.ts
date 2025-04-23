import { setupExposeStore, utils } from '@start9labs/start-sdk'
import { randomPassword } from './utils'

export type Store = {
  hasStarted: boolean
  aezeedCipherSeed: string[] | null
  walletPassword: string
  recoveryWindow: number | null | undefined
}

export const initStore: Store = {
  hasStarted: false,
  aezeedCipherSeed: null,
  walletPassword: utils.getDefaultString(randomPassword),
  recoveryWindow: 200, // @TODO do we need this or what should it be set to?
}

export const exposedStore = setupExposeStore<Store>(() => [])
