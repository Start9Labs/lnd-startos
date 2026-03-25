// import { peerInterfaceId } from './interfaces'
import { sdk } from './sdk'

const bitcoindHost = 'bitcoind.startos'

export const lndDataDir = '/root/.lnd'
export const bitcoindMnt = '/mnt/bitcoin'

export const bitcoindBundle = {
  'bitcoin.node': 'bitcoind',
  'bitcoind.rpchost': `${bitcoindHost}:8332`,
  'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
  'bitcoind.zmqpubrawblock': `tcp://${bitcoindHost}:28332`,
  'bitcoind.zmqpubrawtx': `tcp://${bitcoindHost}:28333`,
  'fee.url': undefined,
} as const

export const neutrinoBundle = {
  'bitcoin.node': 'neutrino',
  'bitcoind.rpchost': undefined,
  'bitcoind.rpccookie': undefined,
  'bitcoind.zmqpubrawblock': undefined,
  'bitcoind.zmqpubrawtx': undefined,
  'fee.url':
    'https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json',
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
