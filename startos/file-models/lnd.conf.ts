import { FileHelper, matches } from '@start9labs/start-sdk'
import { lndConfDefaults } from '../utils'

const { object, anyOf } = matches

const stringArray = matches.array(matches.string)
const string = stringArray.map(([a]) => a).orParser(matches.string)
const number = stringArray.map(([a]) => Number(a)).orParser(matches.number)
const numLiteral = (val: any) => {
  return stringArray.map(([val]) => Number(val)).orParser(matches.literal(val))
}
const boolean = anyOf(numLiteral(0), numLiteral(1))
  .map((a) => !!a)
  .orParser(matches.boolean)
const literal = (val: string) => {
  return stringArray
    .map(([val]) => matches.literal(val))
    .orParser(matches.literal(val))
}

const {
  externalhosts,
  'payments-expiration-grace-period': paymentsExpirationGracePeriod,
  listen,
  rpclisten,
  restlisten,
  'rpcmiddleware.enable': rpcmiddlewareEnable,
  debuglevel,
  minchansize,
  maxchansize,
  'default-remote-max-htlcs': defaultRemoteMaxHtlcs,
  rejecthtlc,
  'max-channel-fee-allocation': maxChannelFeeAllocation,
  maxpendingchannels,
  'max-commit-fee-rate-anchors': maxCommitFeeRateAnchors,
  'accept-keysend': acceptKeysend,
  'accept-amp': acceptAmp,
  'gc-canceled-invoices-on-startup': gcCanceledInvoicesOnStartup,
  'allow-circular-route': allowCircularRoute,
  alias,
  color,
  'fee.url': feeUrl,
  'bitcoin.active': bitcoinActive,
  'bitcoin.mainnet': bitcoinMainnet,
  'bitcoin.node': bitcoinNode,
  'bitcoin.defaultchanconfs': bitcoinDefaultchanconfs,
  'bitcoin.minhtlc': bitcoinMinhtlc,
  'bitcoin.minhtlcout': bitcoinMinhtlcout,
  'bitcoin.basefee': bitcoinBasefee,
  'bitcoin.feerate': bitcoinFeerate,
  'bitcoin.timelockdelta': bitcoinTimelockdelta,
  'bitcoind.rpchost': bitcoindRpchost,
  'bitcoind.rpccookie': bitcoindRpccookie,
  'bitcoind.zmqpubrawblock': bitcoindZmqpubrawblock,
  'bitcoind.zmqpubrawtx': bitcoindZmqpubrawtx,
  'autopilot.active': autopilotActive,
  'autopilot.maxchannels': autopilotMaxchannels,
  'autopilot.allocation': autopilotAllocation,
  'autopilot.minchansize': autopilotMinchansize,
  'autopilot.maxchansize': autopilotMaxchansize,
  'autopilot.private': autopilotPrivate,
  'autopilot.minconfs': autopilotMinconfs,
  'autopilot.conftarget': autopilotConftarget,
  'tor.active': torActive,
  'tor.socks': torSocks,
  'tor.skip-proxy-for-clearnet-targets': torSkipProxyForClearnetTargets,
  'tor.streamisolation': torStreamisolation,
  'watchtower.active': watchtowerActive,
  'watchtower.listen': watchtowerListen,
  'watchtower.externalip': watchtowerExternalip,
  'wtclient.active': wtclientActive,
  'healthcheck.chainbackend.attempts': healthcheckChainbackendAttempts,
  'protocol.wumbo-channels': protocolWumboChannels,
  'protocol.no-anchors': protocolNoAnchors,
  'protocol.no-script-enforced-lease': protocolNoScriptEnforcedLease,
  'protocol.option-scid-alias': protocolOptionScidAlias,
  'protocol.zero-conf': protocolZeroConf,
  'protocol.simple-taproot-chans': protocolSimpleTaprootChans,
  'sweeper.maxfeerate': sweeperMaxfeerate,
  'sweeper.nodeadlineconftarget': sweeperNodeadlineconftarget,
  'sweeper.budget.tolocalratio': sweeperBudgetTolocalration,
  'sweeper.budget.anchorcpfpratio': sweeperBudgetAnchorcpfpratio,
  'sweeper.budget.deadlinehtlcratio': sweeperBudgetDeadlinehtlcratio,
  'sweeper.budget.nodeadlinehtlcratio': sweeperBudgetNodeadlinehtlcratio,
  'db.bolt.nofreelistsync': dbBoltNofreelistsync,
  'db.bolt.auto-compact': dbBoltAutoCompact,
  'db.bolt.auto-compact-min-age': dbBoltAutoCompactMinAge,
  'db.bolt.dbtimeout': dbBoltDbtimeout,
} = lndConfDefaults

export const shape = object({
  // Application Options
  externalhosts: stringArray.onMismatch(externalhosts), // Default peer tor address
  'payments-expiration-grace-period': string
    .optional()
    .onMismatch(paymentsExpirationGracePeriod),
  listen: string.onMismatch(listen),
  rpclisten: string.onMismatch(rpclisten),
  restlisten: string.onMismatch(restlisten),
  'rpcmiddleware.enable': boolean.onMismatch(rpcmiddlewareEnable),
  debuglevel: anyOf(
    literal('trace'),
    literal('debug'),
    literal('info'),
    literal('warn'),
    literal('error'),
    literal('critical'),
  ).onMismatch(debuglevel),
  minchansize: number.optional().onMismatch(minchansize),
  maxchansize: number.optional().onMismatch(maxchansize),
  'default-remote-max-htlcs': number.onMismatch(defaultRemoteMaxHtlcs),
  rejecthtlc: boolean.onMismatch(rejecthtlc),
  'max-channel-fee-allocation': number.onMismatch(maxChannelFeeAllocation),
  maxpendingchannels: number.onMismatch(maxpendingchannels),
  'max-commit-fee-rate-anchors': number.onMismatch(maxCommitFeeRateAnchors),
  'accept-keysend': boolean.onMismatch(acceptKeysend),
  'accept-amp': boolean.onMismatch(acceptAmp),
  'gc-canceled-invoices-on-startup': boolean.onMismatch(
    gcCanceledInvoicesOnStartup,
  ),
  'allow-circular-route': boolean.onMismatch(allowCircularRoute),
  alias: string.optional().onMismatch(alias),
  color: string.optional().onMismatch(color),
  'fee.url': string.optional().onMismatch(feeUrl),

  // Bitcoin
  'bitcoin.active': boolean.onMismatch(bitcoinActive),
  'bitcoin.mainnet': boolean.onMismatch(bitcoinMainnet),
  'bitcoin.node': string.onMismatch(bitcoinNode),
  'bitcoin.defaultchanconfs': number.onMismatch(bitcoinDefaultchanconfs),
  'bitcoin.minhtlc': number.onMismatch(bitcoinMinhtlc),
  'bitcoin.minhtlcout': number.onMismatch(bitcoinMinhtlcout),
  'bitcoin.basefee': number.onMismatch(bitcoinBasefee),
  'bitcoin.feerate': number.onMismatch(bitcoinFeerate),
  'bitcoin.timelockdelta': number.onMismatch(bitcoinTimelockdelta),

  // Bitcoind
  'bitcoind.rpchost': literal(bitcoindRpchost),
  'bitcoind.rpccookie': literal(bitcoindRpccookie),
  'bitcoind.zmqpubrawblock': literal(bitcoindZmqpubrawblock),
  'bitcoind.zmqpubrawtx': literal(bitcoindZmqpubrawtx),

  // Autopilot
  'autopilot.active': boolean.onMismatch(autopilotActive),
  'autopilot.maxchannels': number.onMismatch(autopilotMaxchannels),
  'autopilot.allocation': number.onMismatch(autopilotAllocation),
  'autopilot.minchansize': number.onMismatch(autopilotMinchansize),
  'autopilot.maxchansize': number.onMismatch(autopilotMaxchansize),
  'autopilot.private': boolean.onMismatch(autopilotPrivate),
  'autopilot.minconfs': number.onMismatch(autopilotMinconfs),
  'autopilot.conftarget': number.onMismatch(autopilotConftarget),

  // Tor
  'tor.active': boolean.onMismatch(torActive),
  'tor.socks': string.optional().onMismatch(torSocks), // TODO set in main
  'tor.skip-proxy-for-clearnet-targets': boolean.onMismatch(
    torSkipProxyForClearnetTargets,
  ),
  'tor.streamisolation': boolean.onMismatch(torStreamisolation),

  // Watchtower
  'watchtower.active': boolean.onMismatch(watchtowerActive),
  'watchtower.listen': stringArray.onMismatch(watchtowerListen),
  'watchtower.externalip': string.optional().onMismatch(watchtowerExternalip),

  // Wt Client
  'wtclient.active': boolean.optional().onMismatch(wtclientActive),

  // Healthcheck
  'healthcheck.chainbackend.attempts': number
    .optional()
    .onMismatch(healthcheckChainbackendAttempts),

  // Protocol
  'protocol.wumbo-channels': boolean
    .optional()
    .onMismatch(protocolWumboChannels),
  'protocol.no-anchors': boolean.optional().onMismatch(protocolNoAnchors),
  'protocol.no-script-enforced-lease': boolean
    .optional()
    .onMismatch(protocolNoScriptEnforcedLease),
  'protocol.option-scid-alias': boolean
    .optional()
    .onMismatch(protocolOptionScidAlias),
  'protocol.zero-conf': boolean.optional().onMismatch(protocolZeroConf),
  'protocol.simple-taproot-chans': boolean
    .optional()
    .onMismatch(protocolSimpleTaprootChans),

  // Sweeper
  'sweeper.maxfeerate': number.optional().onMismatch(sweeperMaxfeerate),
  'sweeper.nodeadlineconftarget': number
    .optional()
    .onMismatch(sweeperNodeadlineconftarget),
  'sweeper.budget.tolocalratio': number
    .optional()
    .onMismatch(sweeperBudgetTolocalration),
  'sweeper.budget.anchorcpfpratio': number
    .optional()
    .onMismatch(sweeperBudgetAnchorcpfpratio),
  'sweeper.budget.deadlinehtlcratio': number
    .optional()
    .onMismatch(sweeperBudgetDeadlinehtlcratio),
  'sweeper.budget.nodeadlinehtlcratio': number
    .optional()
    .onMismatch(sweeperBudgetNodeadlinehtlcratio),

  // Bolt
  'db.bolt.nofreelistsync': boolean.optional().onMismatch(dbBoltNofreelistsync),
  'db.bolt.auto-compact': boolean.optional().onMismatch(dbBoltAutoCompact),
  'db.bolt.auto-compact-min-age': string
    .optional()
    .onMismatch(dbBoltAutoCompactMinAge),
  'db.bolt.dbtimeout': string.optional().onMismatch(dbBoltDbtimeout),
})

export function fromLndConf(text: string): Record<string, string[]> {
  const lines = text.split('\n')
  const dictionary = {} as Record<string, string[]>

  for (const line of lines) {
    const [key, value] = line.split('=', 2)
    if (key === '') {
      return dictionary
    } else if (key.startsWith('#')) {
      continue
    }
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()

    if (!dictionary[trimmedKey]) {
      dictionary[trimmedKey] = []
    }

    dictionary[trimmedKey].push(trimmedValue)
  }

  return dictionary
}

function toLndConf(conf: typeof shape._TYPE): string {
  let lndConfStr = ''
  const toString = (a: any) => {
    if (a === true) {
      return '1'
    } else if (a === false) {
      return '0'
    } else {
      return a.toString()
    }
  }

  Object.entries(conf).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      for (const subValue of value) {
        lndConfStr += `${key}=${toString(subValue)}\n`
      }
    } else if (value !== undefined) {
      lndConfStr += `${key}=${toString(value)}\n`
    }
  })

  return lndConfStr
}

export const lndConfFile = FileHelper.raw(
  './lnd/lnd.conf',
  (obj: LndConf) => parseLndConfToString(obj),
  (str) => parseStringToObj(str),
)
