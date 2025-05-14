// import { peerInterfaceId } from './interfaces'
import { sdk } from './sdk'

export const randomPassword = {
  charset: 'A-Z,2-7',
  len: 22,
}

export const bitcoindHost = 'bitcoind.startos'
export const lndDataDir = '/root/.lnd'

export const lndConfDefaults = {
  // hard coded
  'healthcheck.chainbackend.attempts': 0,

  // Application Options
  externalhosts: [] as string[],
  'payments-expiration-grace-period': '30s',
  listen: '0.0.0.0:9735',
  rpclisten: '',
  restlisten: '',
  'rpcmiddleware.enable': true,
  debuglevel: 'info',
  minchansize: undefined,
  maxchansize: undefined,
  'default-remote-max-htlcs': 483,
  rejecthtlc: false,
  'max-channel-fee-allocation': 0.5,
  maxpendingchannels: 5,
  'max-commit-fee-rate-anchors': 100,
  'accept-keysend': true,
  'accept-amp': false,
  'gc-canceled-invoices-on-startup': false,
  'allow-circular-route': false,
  alias: undefined,
  color: undefined,
  'fee.url': '',

  // Bitcoin
  'bitcoin.mainnet': true,
  'bitcoin.node': 'bitcoind',
  'bitcoin.defaultchanconfs': 3,
  'bitcoin.minhtlc': 1,
  'bitcoin.minhtlcout': 1_000,
  'bitcoin.basefee': 1_000,
  'bitcoin.feerate': 1,
  'bitcoin.timelockdelta': 40,

  // Bitcoind
  'bitcoind.rpchost': `${bitcoindHost}:8332`,
  'bitcoind.rpccookie': '/mnt/bitcoin/.cookie',
  'bitcoind.zmqpubrawblock': `${bitcoindHost}:28332`,
  'bitcoind.zmqpubrawtx': `${bitcoindHost}:28333`,

  // Autopilot
  'autopilot.active': false,
  'autopilot.maxchannels': 5,
  'autopilot.allocation': 60,
  'autopilot.minchansize': 20_000,
  'autopilot.maxchansize': 16_777_215,
  'autopilot.private': false,
  'autopilot.minconfs': 1,
  'autopilot.conftarget': 1,

  // Tor
  'tor.active': true,
  'tor.socks': undefined,
  'tor.skip-proxy-for-clearnet-targets': true,
  'tor.streamisolation': false,

  // Watchtower
  'watchtower.active': false,
  'watchtower.listen': [] as string[],
  'watchtower.externalip': undefined,

  // Wt Client
  'wtclient.active': false,

  // Protocol
  'protocol.wumbo-channels': false,
  'protocol.no-anchors': false,
  'protocol.no-script-enforced-lease': false,
  'protocol.option-scid-alias': false,
  'protocol.zero-conf': false,
  'protocol.simple-taproot-chans': false,

  // Sweeper
  'sweeper.maxfeerate': 1_000,
  'sweeper.nodeadlineconftarget': 1_008,
  'sweeper.budget.tolocalratio': 0.5,
  'sweeper.budget.anchorcpfpratio': 0.5,
  'sweeper.budget.deadlinehtlcratio': 0.5,
  'sweeper.budget.nodeadlinehtlcratio': 0.5,

  // Bolt
  'db.bolt.nofreelistsync': false,
  'db.bolt.auto-compact': false,
  'db.bolt.auto-compact-min-age': '168h',
  'db.bolt.dbtimeout': '60s',
} as const

export const mainMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'main',
  subpath: null,
  mountpoint: lndDataDir,
  readonly: false,
})

export type GetInfo = {
  synced_to_chain: boolean
  synced_to_graph: boolean
}

export type TowerInfo = {
  pubkey: string,
  listeners: string[],
  uris: string[]
}

export function getExteralAddresses() {
  return sdk.Value.dynamicSelect(async ({ effects }) => {
    const peerInterface = await sdk.serviceInterface
      .getOwn(effects, 'peer')
      .const()

    const urls = peerInterface?.addressInfo?.publicUrls || []

    if (urls.length === 0) {
      return {
        name: 'External Address',
        description:
          "No available address at which your watchtower can be reached by LND peers.",
        values: { none: 'none' },
        default: 'none',
      }
    }

    const urlsWithNone = urls.reduce(
      (obj, url) => ({
        ...obj,
        [url]: url,
      }),
      {} as Record<string, string>,
    )

    urlsWithNone['none'] = 'none'

    return {
      name: 'External Address',
      description:
        "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.",
      values: urlsWithNone,
      default: urls.find((u) => u.endsWith('.onion')) || '',
    }
  })
}

export function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}