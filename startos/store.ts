import { setupExposeStore } from '@start9labs/start-sdk'

export type Store = {
  aezeedCipherSeed?: string[]
  walletPassword: string
  recoveryWindow: number | null | undefined
}

export const exposedStore = setupExposeStore<Store>(() => [])
