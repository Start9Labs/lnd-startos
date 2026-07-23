import { T, utils } from '@start9labs/start-sdk'
import {
  rpcHostId as btcRpcHostId,
  rpcPort as btcRpcPort,
  zmqHostId as btcZmqHostId,
  zmqPortBlock as btcZmqPortBlock,
  zmqPortTransaction as btcZmqPortTransaction,
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
export const mainVolumeHost = '/media/startos/volumes/main'
// The watchtower *server* database (client sessions + their state-update
// backups), distinct from the wtclient db under data/graph. Deleted whenever
// the server is disabled — by the action and, as a backstop, by the migration.
export const watchtowerServerDir = `${mainVolumeHost}/data/watchtower`

/**
 * Bridge address (`10.0.3.1:<assigned external port>`) of a dependency's
 * binding, as a minimal reactive value. Chain `.const()` in main/init: the
 * mapped string only changes when the address itself does, so the caller
 * restarts exactly on dependency install/uninstall/port-change and never on
 * dependency updates. Chain `.once()` in an action context. `fallbackPort`
 * keeps the value non-null while the dependency is absent — sanctioned only
 * for tor's allocator-guaranteed SOCKS 9050. Drop-in for the planned SDK
 * `sdk.host.getBridgeAddress` helper.
 */
export function bridgeAddress(
  effects: T.Effects,
  opts: {
    packageId: string
    hostId: string
    internalPort: number
    fallbackPort: number
  },
): { const(): Promise<string>; once(): Promise<string> }
export function bridgeAddress(
  effects: T.Effects,
  opts: { packageId: string; hostId: string; internalPort: number },
): { const(): Promise<string | null>; once(): Promise<string | null> }
export function bridgeAddress(
  effects: T.Effects,
  opts: {
    packageId: string
    hostId: string
    internalPort: number
    fallbackPort?: number
  },
) {
  const watchable = async () => {
    const osIp = await sdk.getOsIp(effects)
    return sdk.host.get(
      effects,
      { packageId: opts.packageId, hostId: opts.hostId },
      (host) => {
        const port =
          host?.bindings[opts.internalPort]?.net.assignedPort ??
          opts.fallbackPort
        if (port == null) return null
        return `${osIp}:${port}`
      },
    )
  }
  return {
    const: async () => (await watchable()).const(),
    once: async () => (await watchable()).once(),
  }
}

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
    ? iface.addressInfo.filter({
        kind: 'bridge',
        predicate: (h) =>
          h.metadata.kind === 'ipv4' && (ssl === undefined || h.ssl === ssl),
      }).hostnames[0]
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
 * bitcoind connection settings for lnd.conf, resolved over the bridge. Two
 * subscriptions — one per bitcoind HOST: the RPC host via the `bridgeAddress`
 * helper, and the ZMQ host (which carries both the block and tx bindings) via a
 * single `sdk.host.get` whose map returns the minimal `{ block, tx }` address
 * pair from `net.assignedPort`. Deep-equal on the mapped values keeps both
 * `.const()` subscriptions churn-free: main re-runs only when an address it
 * uses actually changes (bitcoind install/uninstall/port-change), not on a
 * plain bitcoind update. Replaces the static `bitcoind.startos` host.
 */
export const getBitcoindBundle = async (effects: T.Effects) => {
  const rpchost = await bridgeAddress(effects, {
    packageId: 'bitcoind',
    hostId: btcRpcHostId,
    internalPort: btcRpcPort,
  }).const()

  const osIp = await sdk.getOsIp(effects)
  const zmq = await sdk.host
    .get(effects, { hostId: btcZmqHostId, packageId: 'bitcoind' }, (host) => {
      const block = host?.bindings[btcZmqPortBlock]?.net.assignedPort
      const tx = host?.bindings[btcZmqPortTransaction]?.net.assignedPort
      return {
        block: block != null ? `tcp://${osIp}:${block}` : undefined,
        tx: tx != null ? `tcp://${osIp}:${tx}` : undefined,
      }
    })
    .const()

  return {
    'bitcoin.node': 'bitcoind' as const,
    'bitcoind.rpchost': rpchost ?? undefined,
    'bitcoind.rpccookie': `${bitcoindMnt}/.cookie`,
    'bitcoind.zmqpubrawblock': zmq.block,
    'bitcoind.zmqpubrawtx': zmq.tx,
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
