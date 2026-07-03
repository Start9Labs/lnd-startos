import { T, utils } from '@start9labs/start-sdk'
import {
  rpcHostId as btcRpcHostId,
  rpcInterfaceId as btcRpcInterfaceId,
  zmqHostId as btcZmqHostId,
  zmqBlockInterfaceId as btcZmqBlockInterfaceId,
  zmqTxInterfaceId as btcZmqTxInterfaceId,
} from 'bitcoin-core-startos/startos/utils'
import {
  controlHostId,
  gRPCHostId,
  gRPCInterfaceId,
  lndconnectRestId,
} from './interfaces'
import { sdk } from './sdk'

export const lndDataDir = '/root/.lnd'
export const bitcoindMnt = '/mnt/bitcoin'

/**
 * The IPv4 LXC-bridge hostname/port for an interface on an already-resolved
 * `FilledHost`. Pure — call it INSIDE a `sdk.host` map fn so `.const()` narrows its
 * reactivity to just this address rather than firing on any change to the host.
 * `.startos` / direct container IPs are deprecated; containers reach each other
 * over this bridge. `ssl` narrows to the http vs https variant when an interface
 * exposes both.
 */
const bridgeAddr = (
  host: utils.FilledHost | null,
  interfaceId: string,
  ssl?: boolean,
) => {
  const iface =
    host &&
    Object.values(host.bindings)
      .flatMap((b) => Object.values(b.interfaces))
      .find((i) => i.id === interfaceId)
  return iface
    ? iface.addressInfo
        .filter({
          kind: 'bridge',
          predicate: (h) =>
            h.metadata.kind === 'ipv4' && (ssl === undefined || h.ssl === ssl),
        })
        .hostnames[0]
    : undefined
}

/** LND's own REST endpoint over the bridge (replaces `https://lnd.startos:8080`). */
export const selfRestUrl = (effects: T.Effects) =>
  sdk.host
    .getOwn(effects, controlHostId, (host) => {
      const h = bridgeAddr(host, lndconnectRestId, true)
      return h && `https://${h.hostname}:${h.port}`
    })
    .const()

/** LND's own gRPC `host:port` over the bridge (for `lncli --rpcserver`). */
export const selfGrpcHost = (effects: T.Effects) =>
  sdk.host
    .getOwn(effects, gRPCHostId, (host) => {
      const h = bridgeAddr(host, gRPCInterfaceId, true)
      return h && `${h.hostname}:${h.port}`
    })
    .const()

/**
 * bitcoind connection settings for lnd.conf. Two subscriptions — bitcoind's RPC
 * host and its ZMQ host (which carries both the block and tx interfaces) — each
 * with a map fn that returns only the resolved addresses, so the caller re-runs
 * only when a value it actually uses changes. Replaces the static
 * `bitcoind.startos` host.
 */
export const getBitcoindBundle = async (effects: T.Effects) => {
  const rpchost = await sdk.host
    .get(effects, { hostId: btcRpcHostId, packageId: 'bitcoind' }, (host) => {
      const rpc = bridgeAddr(host, btcRpcInterfaceId, false)
      return rpc && `${rpc.hostname}:${rpc.port}`
    })
    .const()
  const zmq = await sdk.host
    .get(effects, { hostId: btcZmqHostId, packageId: 'bitcoind' }, (host) => {
      const block = bridgeAddr(host, btcZmqBlockInterfaceId)
      const tx = bridgeAddr(host, btcZmqTxInterfaceId)
      return {
        block: block && `tcp://${block.hostname}:${block.port}`,
        tx: tx && `tcp://${tx.hostname}:${tx.port}`,
      }
    })
    .const()
  return {
    'bitcoin.node': 'bitcoind' as const,
    'bitcoind.rpchost': rpchost,
    'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
    'bitcoind.zmqpubrawblock': zmq?.block,
    'bitcoind.zmqpubrawtx': zmq?.tx,
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
  synced_to_chain: boolean
  synced_to_graph: boolean
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
