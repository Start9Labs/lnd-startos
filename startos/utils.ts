// import { peerInterfaceId } from './interfaces'
import { sdk } from './sdk'

const bitcoindHost = 'bitcoind.startos'

export const lndDataDir = '/root/.lnd'
export const bitcoindMnt = '/mnt/bitcoin'

export const bitcoindBundle = {
  'bitcoind.rpchost': `${bitcoindHost}:8332`,
  'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
  'bitcoind.zmqpubrawblock': `tcp://${bitcoindHost}:28332`,
  'bitcoind.zmqpubrawtx': `tcp://${bitcoindHost}:28333`,
} as const

export const mainMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'main',
  subpath: null,
  mountpoint: lndDataDir,
  readonly: false,
})

export type GetInfo = {
  identity_pubkey: string
  alias: string
  uris: string[]
  synced_to_chain: boolean
  synced_to_graph: boolean
}

export type TowerInfo = {
  pubkey: string
  listeners: string[]
  uris: string[]
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const randomPassword = {
  charset: 'A-Z,2-7',
  len: 22,
}
