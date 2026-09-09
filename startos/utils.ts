import { T } from '@start9labs/start-sdk'
import {
  rpcHostId as btcRpcHostId,
  rpcPort as btcRpcPort,
  zmqHostId as btcZmqHostId,
  zmqPortBlock as btcZmqPortBlock,
  zmqPortTransaction as btcZmqPortTransaction,
} from 'bitcoin-core-startos/startos/utils'
import { gRPCPort, restPort } from './interfaces'
import { sdk } from './sdk'

export const lndDataDir = '/root/.lnd'
export const bitcoindMnt = '/mnt/bitcoin'
export const mainVolumeHost = '/media/startos/volumes/main'
// The watchtower *server* database (client sessions + their state-update
// backups), distinct from the wtclient db under data/graph. Deleted whenever
// the server is disabled — by the action and, as a backstop, by the migration.
export const watchtowerServerDir = `${mainVolumeHost}/data/watchtower`

/**
 * LND's own endpoints for its self-calls. Loopback rather than the bridge: the
 * bridge answers REST with the proxy's device cert, failing the `tls.cert` pin.
 */
export const selfRestUrl = `https://127.0.0.1:${restPort}`
export const selfGrpcHost = `127.0.0.1:${gRPCPort}`

/**
 * bitcoind connection settings for lnd.conf. Each address is its own `.const()`
 * on a single string, so main re-runs only when an address it uses actually
 * changes (bitcoind install/uninstall/port-change), not on a plain bitcoind
 * update. Replaces the static `bitcoind.startos` host.
 */
export const getBitcoindBundle = async (effects: T.Effects) => {
  const zmqAddr = (internalPort: number) =>
    sdk.host
      .getBridgeAddress(effects, {
        packageId: 'bitcoind',
        hostId: btcZmqHostId,
        internalPort,
      })
      .const()

  const rpchost = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'bitcoind',
      hostId: btcRpcHostId,
      internalPort: btcRpcPort,
      ssl: false,
    })
    .const()
  const block = await zmqAddr(btcZmqPortBlock)
  const tx = await zmqAddr(btcZmqPortTransaction)

  return {
    'bitcoin.node': 'bitcoind' as const,
    'bitcoind.rpchost': rpchost ?? undefined,
    'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
    'bitcoind.zmqpubrawblock': block ? `tcp://${block}` : undefined,
    'bitcoind.zmqpubrawtx': tx ? `tcp://${tx}` : undefined,
    'fee.url': undefined,
  }
}

export const neutrinoBundle = {
  'bitcoin.node': 'neutrino',
  'bitcoind.rpchost': undefined,
  'bitcoind.rpccookie': undefined,
  'bitcoind.zmqpubrawblock': undefined,
  'bitcoind.zmqpubrawtx': undefined,
  'fee.url': 'https://nodes.lightning.computer/fees/v1/btc-fee-estimates.json',
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
  num_peers: number
  synced_to_chain: boolean
  synced_to_graph: boolean
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
