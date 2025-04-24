import { setupExposeStore, utils } from '@start9labs/start-sdk'
import { randomPassword } from './utils'

export type Store = {
  hasStarted: boolean
  aezeedCipherSeed: string[] | null
  walletPassword: string
  recoveryWindow: number | null | undefined
  bitcoindSelected: boolean
}

export const initStore: Store = {
  hasStarted: false,
  aezeedCipherSeed: null,
  walletPassword: utils.getDefaultString(randomPassword),
  recoveryWindow: 2_500,
  bitcoindSelected: false,
}

export const exposedStore = setupExposeStore<Store>(() => [])
