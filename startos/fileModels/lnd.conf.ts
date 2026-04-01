import { FileHelper, T, z } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

// INI coercion helpers: LND conf parsing returns strings/numbers/booleans for
// single values, string arrays for duplicate keys. Each uses
// .optional().catch(undefined) for user-configurable fields.

const iniString = z
  .union([z.array(z.string()).transform((a) => a.at(-1)!), z.coerce.string()])
  .optional()
  .catch(undefined)

const iniStringArray = z
  .union([
    z.array(z.string()).transform((a) => (a.length ? a : undefined)),
    z.string().transform((s) => [s]),
  ])
  .optional()
  .catch(undefined)

const iniNumber = z
  .union([
    z.array(z.string()).transform((a) => Number(a.at(-1))),
    z.string().transform(Number),
    z.number(),
  ])
  .optional()
  .catch(undefined)

const iniBoolean = z
  .union([
    z.string().transform((s) => s === 'true' || (s !== 'false' && !!Number(s))),
    z.number().transform((n) => !!n),
    z.boolean(),
  ])
  .optional()
  .catch(undefined)

export const shape = z.object({
  // ──── Enforced (StartOS) ────
  'healthcheck.chainbackend.attempts': z.literal(0).catch(0),
  rpclisten: z.tuple([z.literal('0.0.0.0:10009')]).catch(['0.0.0.0:10009']),
  restlisten: z.tuple([z.literal('0.0.0.0:8080')]).catch(['0.0.0.0:8080']),
  listen: z.literal('0.0.0.0:9735').catch('0.0.0.0:9735'),
  'rpcmiddleware.enable': z.literal(true).catch(true),
  'bitcoin.mainnet': z.literal(true).catch(true),
  'bitcoind.rpcuser': z.undefined().catch(undefined),
  'bitcoind.rpcpass': z.undefined().catch(undefined),
  'bitcoin.active': z.undefined().catch(undefined), // deprecated
  'tor.active': z.literal(true).catch(true),
  'tor.v3': z.undefined().catch(undefined),

  // ──── Bitcoind (set by backend config) ────
  'bitcoind.rpchost': iniString,
  'bitcoind.rpccookie': iniString,
  'bitcoind.zmqpubrawblock': iniString,
  'bitcoind.zmqpubrawtx': iniString,

  // ──── Application Options ────
  externalhosts: iniStringArray,
  'accept-keysend': iniBoolean,
  'accept-amp': iniBoolean,
  alias: iniString,
  color: iniString,
  'fee.url': iniString,
  externalip: iniStringArray,

  // ──── Channel Settings ────
  minchansize: iniNumber,
  maxchansize: iniNumber,
  'protocol.wumbo-channels': iniBoolean,
  'protocol.option-scid-alias': iniBoolean,
  'protocol.zero-conf': iniBoolean,
  maxpendingchannels: iniNumber,
  'allow-circular-route': iniBoolean,
  rejectpush: iniBoolean,
  'coop-close-target-confs': iniNumber,

  // ──── Bitcoin ────
  'bitcoin.node': z.enum(['bitcoind', 'neutrino']).optional().catch(undefined),
  'bitcoin.defaultchanconfs': iniNumber,
  'bitcoin.basefee': iniNumber,
  'bitcoin.feerate': iniNumber,
  'bitcoin.timelockdelta': iniNumber,

  // ──── Performance ────
  'db.bolt.auto-compact': iniBoolean,
  'gc-canceled-invoices-on-startup': iniBoolean,
  'gc-canceled-invoices-on-the-fly': iniBoolean,
  'stagger-initial-reconnect': iniBoolean,
  'ignore-historical-gossip-filters': iniBoolean,
  'routing.strictgraphpruning': iniBoolean,

  // ──── Autopilot ────
  'autopilot.active': iniBoolean,
  'autopilot.maxchannels': iniNumber,
  'autopilot.allocation': iniNumber,
  'autopilot.minchansize': iniNumber,
  'autopilot.maxchansize': iniNumber,
  'autopilot.private': iniBoolean,
  'autopilot.minconfs': iniNumber,
  'autopilot.conftarget': iniNumber,

  // ──── Tor ────
  'tor.socks': iniString,
  'tor.skip-proxy-for-clearnet-targets': iniBoolean,

  // ──── Watchtower ────
  'watchtower.active': iniBoolean,
  'watchtower.listen': iniStringArray,
  'watchtower.externalip': iniString,

  // ──── Watchtower Client ────
  'wtclient.active': iniBoolean,
})

export type LndConf = z.infer<typeof shape>

// ════════════════════════════════════════════════════════════════════════════
// Master InputSpec — all user-configurable form fields
// ════════════════════════════════════════════════════════════════════════════

const { InputSpec, Value, Variants, List } = sdk

export const fullConfigSpec = InputSpec.of({
  // ── General ──
  alias: Value.text({
    name: i18n('Alias'),
    default: null,
    required: false,
    description: i18n('The public, human-readable name of your Lightning node'),
    patterns: [
      {
        regex: '.{1,32}',
        description: i18n(
          'Must be at least 1 character and no more than 32 characters',
        ),
      },
    ],
  }),
  color: Value.text({
    name: i18n('Color'),
    default: null,
    required: false,
    description: i18n('The public color dot of your Lightning node'),
    patterns: [
      {
        regex: '[0-9a-fA-F]{6}',
        description: i18n(
          'Must be a valid 6 digit hexadecimal RGB value. The first two digits are red, middle two are green, and final two are blue',
        ),
      },
    ],
  }),
  'accept-keysend': Value.toggle({
    name: i18n('Accept Keysend'),
    default: true,
    description: i18n(
      'Allow others to send payments directly to your public key through keysend instead of having to get a new invoice',
    ),
  }),
  'accept-amp': Value.toggle({
    name: i18n('Accept AMP'),
    default: false,
    description: i18n(
      'Accept Atomic Multi-Path spontaneous payments. AMP allows a single payment to be split across multiple channels for better reliability',
    ),
  }),
  'use-tor-only': Value.toggle({
    name: i18n('Use Tor for all traffic'),
    default: false,
    description: i18n(
      "Use the tor proxy even for connections that are reachable on clearnet. This will hide your node's public IP address, but will slow down your node's performance",
    ),
  }),
  // ── Routing Fees ──
  'base-fee': Value.number({
    name: i18n('Routing Base Fee'),
    description: i18n(
      'The base fee in millisatoshi you will charge for forwarding payments on your channels. ',
    ),
    default: null,
    placeholder: '1000',
    required: false,
    min: 0,
    integer: true,
    units: 'millisatoshi',
  }),
  'fee-rate': Value.number({
    name: i18n('Routing Fee Rate'),
    description: i18n(
      'The fee rate used when forwarding payments on your channels. The total fee charged is the Base Fee + (amount * Fee Rate / 1000000), where amount is the forwarded amount. Measured in sats per million ',
    ),
    default: null,
    placeholder: '1',
    required: false,
    min: 0,
    max: 1000000,
    integer: true,
    units: 'sats per million',
  }),
  'timelock-delta': Value.number({
    name: i18n('Time Lock Delta'),
    description: i18n(
      'The number of blocks subtracted from the incoming HTLC timelock for forwarded payments. Higher values are safer but may reduce routing competitiveness. Routing nodes commonly use 144 (approximately 24 hours)',
    ),
    default: null,
    placeholder: '80',
    required: false,
    min: 18,
    max: 2016,
    integer: true,
    units: 'blocks',
  }),
  // ── Channel Settings ──
  'default-channel-confirmations': Value.number({
    name: i18n('Default Channel Confirmations'),
    description: i18n(
      "The default number of confirmations a channel must have before it's considered open. LND will require any incoming channel requests to wait this many confirmations before it considers the channel active. ",
    ),
    default: null,
    placeholder: '3',
    required: false,
    min: 1,
    max: 6,
    integer: true,
    units: 'blocks',
  }),
  'min-channel-size': Value.number({
    name: i18n('Minimum Channel Size'),
    description: i18n(
      'The smallest channel size in satoshis that your node will accept. Increase this to reject tiny, uneconomical channels. The upstream default is 20,000 sats',
    ),
    default: null,
    placeholder: '20000',
    required: false,
    min: 20000,
    integer: true,
    units: 'satoshis',
  }),
  'max-channel-size': Value.number({
    name: i18n('Maximum Channel Size'),
    description: i18n(
      'The largest channel size in satoshis that your node will accept. To accept channels larger than ~0.167 BTC (16,777,215 sats), you must also enable Wumbo Channels',
    ),
    default: null,
    placeholder: '16777215',
    required: false,
    min: 20000,
    integer: true,
    units: 'satoshis',
  }),
  'wumbo-channels': Value.toggle({
    name: i18n('Wumbo Channels'),
    default: false,
    description: i18n(
      'Enable support for channels larger than ~0.167 BTC (16,777,215 sats). Both peers must have Wumbo enabled to open a large channel. Required if you set a Maximum Channel Size above 16,777,215',
    ),
  }),
  'option-scid-alias': Value.toggle({
    name: i18n('Enable option-scid-alias Channels'),
    default: false,
    description: i18n(
      'Set to enable support for option_scid_alias channels, which can be referred to by an alias instead of the confirmed ShortChannelID. Additionally, is needed to open zero-conf channels. ',
    ),
  }),
  'zero-conf': Value.toggle({
    name: i18n('Enable zero-conf Channels'),
    default: false,
    description: i18n(
      'Enable support for zero-confirmation channels. Requires option-scid-alias to also be enabled. Zero-conf channels can be used immediately without waiting for on-chain confirmations. Required for Lightning Loop and Pool integration',
    ),
  }),
  'max-pending-channels': Value.number({
    name: i18n('Max Pending Channels'),
    description: i18n(
      'The maximum number of incoming channel requests waiting to be confirmed per peer. Increase this if you want to allow peers to batch-open multiple channels with you',
    ),
    default: null,
    placeholder: '1',
    required: false,
    min: 1,
    max: 10,
    integer: true,
  }),
  'allow-circular-route': Value.toggle({
    name: i18n('Allow Circular Route'),
    default: false,
    description: i18n(
      'Allow a payment to arrive and depart through the same channel. Required for self-rebalancing tools such as Balance of Satoshis or circular rebalance scripts',
    ),
  }),
  'reject-push': Value.toggle({
    name: i18n('Reject Push'),
    default: false,
    description: i18n(
      'Reject incoming channel open requests that include a non-zero push amount (where the opener gifts sats to your side). This can be used as a precaution against certain probing attacks',
    ),
  }),
  'coop-close-target': Value.number({
    name: i18n('Cooperative Close Confirmation Target'),
    description: i18n(
      'The target number of blocks for cooperative channel close transactions. Lower values pay higher on-chain fees for faster confirmation. Higher values (e.g. 100-1000) can save fees when speed is not important',
    ),
    default: null,
    placeholder: '6',
    required: false,
    min: 1,
    integer: true,
    units: 'blocks',
  }),
  // ── Performance ──
  'auto-compact': Value.toggle({
    name: i18n('Auto-Compact Database'),
    default: false,
    description: i18n(
      'Automatically compact the bolt database on startup. Compaction reclaims wasted disk space and can improve performance over time. Recommended for most nodes',
    ),
  }),
  'gc-canceled-invoices-startup': Value.toggle({
    name: i18n('Delete Canceled Invoices on Startup'),
    default: false,
    description: i18n(
      'Delete all canceled invoices when LND starts. This reduces database size and improves performance',
    ),
  }),
  'gc-canceled-invoices-live': Value.toggle({
    name: i18n('Delete Canceled Invoices Immediately'),
    default: false,
    description: i18n(
      'Delete canceled invoices immediately as they are canceled, rather than waiting for startup cleanup',
    ),
  }),
  'stagger-initial-reconnect': Value.toggle({
    name: i18n('Stagger Initial Reconnect'),
    default: false,
    description: i18n(
      'Randomize the delay between reconnection attempts to peers on startup. Prevents a bandwidth spike when all peers reconnect simultaneously. Recommended for routing nodes',
    ),
  }),
  'ignore-historical-gossip': Value.toggle({
    name: i18n('Ignore Historical Gossip Filters'),
    default: false,
    description: i18n(
      'Do not serve historical gossip data to peers that request it. Saves bandwidth and CPU at the cost of being less helpful to peers bootstrapping their network graph',
    ),
  }),
  'strict-graph-pruning': Value.toggle({
    name: i18n('Strict Graph Pruning'),
    default: false,
    description: i18n(
      'Prune a channel from the network graph if even one of its edges (direction announcements) is stale. Results in a smaller, more accurate routing graph',
    ),
  }),
  // ── Autopilot ──
  autopilot: Value.union({
    name: i18n('Enable Autopilot'),
    description: i18n(
      'If the autopilot agent should be active or not. The autopilot agent will attempt to AUTOMATICALLY OPEN CHANNELS to put your node in an advantageous position within the network graph.',
    ),
    warning: i18n(
      'DO NOT ENABLE AUTOPILOT IF YOU WANT TO MANAGE CHANNELS MANUALLY OR IF YOU DO NOT UNDERSTAND THIS FEATURE.',
    ),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Disabled'), spec: InputSpec.of({}) },
      enabled: {
        name: i18n('Enabled'),
        spec: InputSpec.of({
          private: Value.toggle({
            name: i18n('Private'),
            default: false,
            description: i18n(
              "Whether the channels created by the autopilot agent should be private or not. Private channels won't be announced to the network.",
            ),
          }),
          maxchannels: Value.number({
            name: i18n('Maximum Channels'),
            description: i18n(
              'The maximum number of channels that should be created.',
            ),
            default: null,
            placeholder: '5',
            required: false,
            min: 1,
            integer: true,
          }),
          allocation: Value.number({
            name: i18n('Allocation'),
            description: i18n(
              'The fraction of total funds that should be committed to automatic channel establishment. For example 60% means that 60% of the total funds available within the wallet should be used to automatically establish channels. The total amount of attempted channels will still respect the "Maximum Channels" parameter. ',
            ),
            default: null,
            placeholder: '60',
            required: false,
            min: 0,
            max: 100,
            integer: true,
            units: '%',
          }),
          'min-channel-size': Value.number({
            name: i18n('Minimum Channel Size'),
            description: i18n(
              'The smallest channel that the autopilot agent should create.',
            ),
            default: null,
            placeholder: '20000',
            required: false,
            min: 0,
            integer: true,
            units: 'satoshis',
          }),
          'max-channel-size': Value.number({
            name: i18n('Maximum Channel Size'),
            description: i18n(
              'The largest channel that the autopilot agent should create.',
            ),
            default: null,
            placeholder: '16777215',
            required: false,
            min: 0,
            integer: true,
            units: 'satoshis',
          }),
          'min-confirmations': Value.number({
            name: i18n('Minimum Confirmations'),
            description: i18n(
              'The minimum number of confirmations each of your inputs in funding transactions created by the autopilot agent must have.',
            ),
            default: null,
            placeholder: '1',
            required: false,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
          'confirmation-target': Value.number({
            name: i18n('Confirmation Target'),
            description: i18n(
              'The confirmation target (in blocks) for channels opened by autopilot.',
            ),
            default: null,
            placeholder: '3',
            required: false,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
        }),
      },
    }),
  }),

  // ── Backend ──
  bitcoind: Value.select({
    name: i18n('Select Bitcoin Node'),
    description: i18n(
      'Select between a local bitcoin node and Neutrino as the backend for LND. As Neutrino involves reliance on third-party nodes it is advisable to use either Core or Knots instead. Once Core or Knots are selected it is not supported to switch to Neutrino; however LND can always switch from Neutrino to Core/Knots at a later time.',
    ),
    default: 'bitcoind',
    values: {
      bitcoind: i18n('Local Bitcoin Node'),
      neutrino: i18n('Neutrino'),
    },
  }),

  // ── Watchtower Client ──
  'wt-client': Value.union({
    name: i18n('Enable Watchtower Client'),
    description: i18n('Enable or disable Watchtower Client'),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Disabled'), spec: InputSpec.of({}) },
      enabled: {
        name: i18n('Enabled'),
        spec: InputSpec.of({
          'add-watchtowers': Value.list(
            List.text(
              {
                name: i18n('Add Watchtowers'),
                default: [],
                description: i18n('Add URIs of Watchtowers to connect to.'),
                minLength: 1,
              },
              { placeholder: 'pubkey@host:9911', patterns: [] },
            ),
          ),
        }),
      },
    }),
  }),
})

// ════════════════════════════════════════════════════════════════════════════
// File ↔ Form conversion
// ════════════════════════════════════════════════════════════════════════════

type FormType = typeof fullConfigSpec._TYPE
type PartialFormType = T.DeepPartial<FormType>

export function fileToForm(conf: LndConf): PartialFormType {
  return {
    // General
    alias: conf.alias,
    color: conf.color?.replace('#', ''),
    'accept-keysend': conf['accept-keysend'],
    'accept-amp': conf['accept-amp'],
    'use-tor-only':
      conf['tor.skip-proxy-for-clearnet-targets'] != null
        ? !conf['tor.skip-proxy-for-clearnet-targets']
        : undefined,
    // Routing Fees
    'base-fee': conf['bitcoin.basefee'],
    'fee-rate': conf['bitcoin.feerate'],
    'timelock-delta': conf['bitcoin.timelockdelta'],
    // Channel Settings
    'default-channel-confirmations': conf['bitcoin.defaultchanconfs'],
    'min-channel-size': conf.minchansize,
    'max-channel-size': conf.maxchansize,
    'wumbo-channels': conf['protocol.wumbo-channels'],
    'option-scid-alias': conf['protocol.option-scid-alias'],
    'zero-conf': conf['protocol.zero-conf'],
    'max-pending-channels': conf.maxpendingchannels,
    'allow-circular-route': conf['allow-circular-route'],
    'reject-push': conf.rejectpush,
    'coop-close-target': conf['coop-close-target-confs'],
    // Performance
    'auto-compact': conf['db.bolt.auto-compact'],
    'gc-canceled-invoices-startup': conf['gc-canceled-invoices-on-startup'],
    'gc-canceled-invoices-live': conf['gc-canceled-invoices-on-the-fly'],
    'stagger-initial-reconnect': conf['stagger-initial-reconnect'],
    'ignore-historical-gossip': conf['ignore-historical-gossip-filters'],
    'strict-graph-pruning': conf['routing.strictgraphpruning'],

    // Autopilot
    autopilot: conf['autopilot.active']
      ? {
          selection: 'enabled' as const,
          value: {
            maxchannels: conf['autopilot.maxchannels'],
            allocation:
              conf['autopilot.allocation'] != null
                ? conf['autopilot.allocation'] * 100
                : undefined,
            'min-channel-size': conf['autopilot.minchansize'],
            'max-channel-size': conf['autopilot.maxchansize'],
            private: conf['autopilot.private'],
            'min-confirmations': conf['autopilot.minconfs'],
            'confirmation-target': conf['autopilot.conftarget'],
          },
        }
      : { selection: 'disabled' as const },

    // Backend
    bitcoind:
      conf['bitcoin.node'] === 'neutrino'
        ? ('neutrino' as const)
        : ('bitcoind' as const),

    // Watchtower Client — wt-client reads from store, not conf.
    // Actions that need it will overlay from storeJson.
  }
}

export function formToFile(
  input: PartialFormType,
): Partial<Record<string, unknown>> {
  const result: Record<string, unknown> = {}

  // General
  if ('alias' in input) result.alias = input.alias || undefined
  if ('color' in input)
    result.color = input.color ? `#${input.color}` : undefined
  if ('accept-keysend' in input)
    result['accept-keysend'] = input['accept-keysend']
  if ('accept-amp' in input) result['accept-amp'] = input['accept-amp']

  // Tor
  if ('use-tor-only' in input)
    result['tor.skip-proxy-for-clearnet-targets'] = !input['use-tor-only']

  // Routing Fees
  if ('base-fee' in input) result['bitcoin.basefee'] = input['base-fee']
  if ('fee-rate' in input) result['bitcoin.feerate'] = input['fee-rate']
  if ('timelock-delta' in input)
    result['bitcoin.timelockdelta'] = input['timelock-delta']

  // Channel Settings
  if ('default-channel-confirmations' in input)
    result['bitcoin.defaultchanconfs'] = input['default-channel-confirmations']
  if ('min-channel-size' in input)
    result.minchansize = input['min-channel-size']
  if ('max-channel-size' in input)
    result.maxchansize = input['max-channel-size']
  if ('wumbo-channels' in input)
    result['protocol.wumbo-channels'] = input['wumbo-channels']
  if ('option-scid-alias' in input)
    result['protocol.option-scid-alias'] = input['option-scid-alias']
  if ('zero-conf' in input)
    result['protocol.zero-conf'] = input['zero-conf']
  if ('max-pending-channels' in input)
    result.maxpendingchannels = input['max-pending-channels']
  if ('allow-circular-route' in input)
    result['allow-circular-route'] = input['allow-circular-route']
  if ('reject-push' in input) result.rejectpush = input['reject-push']
  if ('coop-close-target' in input)
    result['coop-close-target-confs'] = input['coop-close-target']

  // Performance
  if ('auto-compact' in input)
    result['db.bolt.auto-compact'] = input['auto-compact']
  if ('gc-canceled-invoices-startup' in input)
    result['gc-canceled-invoices-on-startup'] =
      input['gc-canceled-invoices-startup']
  if ('gc-canceled-invoices-live' in input)
    result['gc-canceled-invoices-on-the-fly'] =
      input['gc-canceled-invoices-live']
  if ('stagger-initial-reconnect' in input)
    result['stagger-initial-reconnect'] = input['stagger-initial-reconnect']
  if ('ignore-historical-gossip' in input)
    result['ignore-historical-gossip-filters'] =
      input['ignore-historical-gossip']
  if ('strict-graph-pruning' in input)
    result['routing.strictgraphpruning'] = input['strict-graph-pruning']

  // Autopilot
  if (input.autopilot) {
    if (input.autopilot.selection === 'disabled') {
      result['autopilot.active'] = false
    } else if (input.autopilot.selection === 'enabled') {
      const val = input.autopilot.value
      result['autopilot.active'] = true
      if (val) {
        if ('maxchannels' in val)
          result['autopilot.maxchannels'] = val.maxchannels
        if ('allocation' in val)
          result['autopilot.allocation'] =
            val.allocation != null ? val.allocation / 100 : undefined
        if ('min-channel-size' in val)
          result['autopilot.minchansize'] = val['min-channel-size']
        if ('max-channel-size' in val)
          result['autopilot.maxchansize'] = val['max-channel-size']
        if ('private' in val) result['autopilot.private'] = val.private
        if ('min-confirmations' in val)
          result['autopilot.minconfs'] = val['min-confirmations']
        if ('confirmation-target' in val)
          result['autopilot.conftarget'] = val['confirmation-target']
      }
    }
  }

  // Backend
  if ('bitcoind' in input) result['bitcoin.node'] = input.bitcoind

  // Watchtower Client — handled by action (writes to store + conf separately)
  if (input['wt-client']) {
    result['wtclient.active'] = input['wt-client'].selection === 'enabled'
  }

  return result
}

// ════════════════════════════════════════════════════════════════════════════
// File I/O
// ════════════════════════════════════════════════════════════════════════════

export function fromLndConf(text: string): Record<string, string[]> {
  const lines = text.trimEnd().split('\n')
  const dictionary = {} as Record<string, string[]>

  for (const line of lines) {
    const [key, value] = line.split('=', 2)
    if (key.startsWith('#') || key.startsWith('[') || key === '') {
      continue
    }
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()

    if (!dictionary[trimmedKey]) {
      dictionary[trimmedKey] = []
    }

    dictionary[trimmedKey].push(trimmedValue)
  }

  const formattedDictionary = Object.fromEntries(
    Object.entries(dictionary).map(([k, v]) => {
      if (v.length === 1) {
        let innerVal: string | number | boolean
        if (!isNaN(Number(v[0]))) {
          innerVal = Number(v[0])
        } else if (v[0] === 'true') {
          innerVal = true
        } else if (v[0] === 'false') {
          innerVal = false
        } else {
          innerVal = v[0]
        }
        return [k, innerVal]
      }
      return [k, v]
    }),
  )
  return formattedDictionary
}

function toLndConf(conf: LndConf): string {
  let lndConfStr = ''

  Object.entries(conf).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      for (const subValue of value) {
        lndConfStr += `${key}=${String(subValue)}\n`
      }
    } else if (value !== undefined) {
      lndConfStr += `${key}=${String(value)}\n`
    }
  })

  return lndConfStr
}

export const lndConfFile = FileHelper.raw(
  {
    base: sdk.volumes.main,
    subpath: '/lnd.conf',
  },
  (obj: LndConf) => toLndConf(obj),
  (str) => fromLndConf(str),
  (obj) => shape.parse(obj),
)
