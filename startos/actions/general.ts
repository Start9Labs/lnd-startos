import { lndConfFile } from '../file-models/lnd.conf'
import { sdk } from '../sdk'
import { lndConfDefaults } from '../utils'

const { InputSpec, Value } = sdk

const {
  'payments-expiration-grace-period': paymentsExpirationGracePeriod,
  'default-remote-max-htlcs': defaultRemoteMaxHtlcs,
  rejecthtlc,
  'max-channel-fee-allocation': maxChannelFeeAllocation,
  maxpendingchannels,
  'max-commit-fee-rate-anchors': maxCommitFeeRateAnchors,
  'accept-keysend': acceptKeysend,
  'accept-amp': acceptAmp,
  'gc-canceled-invoices-on-startup': gcCanceledInvoicesOnStartup,
  'allow-circular-route': allowCircularRoute,
  'tor.skip-proxy-for-clearnet-targets': torSkipProxyForClearnetTargets,
  'tor.streamisolation': torStreamisolation,
} = lndConfDefaults

const generalSpec = InputSpec.of({
  alias: Value.text({
    name: 'Alias',
    default: null,
    required: false,
    description: 'The public, human-readable name of your Lightning node',
    patterns: [
      {
        regex: '.{1,32}',
        description:
          'Must be at least 1 character and no more than 32 characters',
      },
    ],
  }),
  color: Value.text({
    name: 'Color',
    default: {
      charset: 'a-f,0-9',
      len: 6,
    },
    required: true,
    description: 'The public color dot of your Lightning node',
    patterns: [
      {
        regex: '[0-9a-fA-F]{6}',
        description:
          'Must be a valid 6 digit hexadecimal RGB value. The first two digits are red, middle two are green, and final two are blue',
      },
    ],
  }),
  'accept-keysend': Value.toggle({
    name: 'Accept Keysend',
    default: acceptKeysend,
    description:
      'Allow others to send payments directly to your public key through keysend instead of having to get a new invoice',
  }),
  'accept-amp': Value.toggle({
    name: 'Accept Spontaneous AMPs',
    default: acceptAmp,
    description:
      'If enabled, spontaneous payments through AMP will be accepted. Payments to AMP invoices will be accepted regardless of this setting.',
  }),
  'reject-htlc': Value.toggle({
    name: 'Reject Routing Requests',
    default: rejecthtlc,
    description:
      "If true, LND will not forward any HTLCs that are meant as onward payments. This option will still allow LND to send HTLCs and receive HTLCs but lnd won't be used as a hop.",
  }),
  'min-chan-size': Value.number({
    name: 'Minimum Channel Size',
    description:
      'The smallest channel size that we should accept. Incoming channels smaller than this will be rejected.',
    default: null,
    required: false,
    min: 1,
    max: 16777215,
    integer: true,
    units: 'satoshis',
  }),
  'max-chan-size': Value.number({
    name: 'Maximum Channel Size',
    description:
      "The largest channel size that we should accept. Incoming channels larger than this will be rejected. For non-Wumbo channels this limit remains 16777215 satoshis by default as specified in BOLT-0002. For wumbo channels this limit is 1,000,000,000 satoshis (10 BTC). Set this config option explicitly to restrict your maximum channel size to better align with your risk tolerance.  Don't forget to enable Wumbo channels under 'Advanced,' if desired.",
    default: null,
    required: false,
    min: 1,
    max: 1000000000,
    integer: true,
    units: 'satoshis',
  }),
  tor: Value.object(
    {
      name: 'Tor Config',
      description:
        'Advanced options for increasing privacy (at the cost of performance) using Tor',
    },
    InputSpec.of({
      'use-tor-only': Value.toggle({
        name: 'Use Tor for all traffic',
        default: !torSkipProxyForClearnetTargets,
        description:
          "Use the tor proxy even for connections that are reachable on clearnet. This will hide your node's public IP address, but will slow down your node's performance",
      }),
      'stream-isolation': Value.toggle({
        name: 'Stream Isolation',
        default: torStreamisolation,
        description:
          "Enable Tor stream isolation by randomizing user credentials for each connection. With this mode active, each connection will use a new circuit. This means that multiple applications (other than lnd) using Tor won't be mixed in with lnd's traffic. This option may not be used when 'Use Tor for all traffic' is disabled, since direct connections compromise source IP privacy by default.",
      }),
    }),
  ),
  advanced: Value.object(
    {
      name: 'Advanced',
      description: 'Advanced Options',
    },
    InputSpec.of({
      'debug-level': Value.select({
        name: 'Log Verbosity',
        description:
          'Sets the level of log filtration. Trace is the most verbose, Critical is the least.',
        default: 'info',
        values: {
          trace: 'trace',
          debug: 'debug',
          info: 'info',
          warn: 'warn',
          error: 'error',
          critical: 'critical',
        },
      } as const),
      'recovery-window': Value.number({
        name: 'Recovery Window',
        description:
          "Optional address 'look-ahead' when scanning for used keys during an on-chain recovery.  For example, a value of 2 would mean LND would stop looking for funds after finding 2 consecutive addresses that were generated but never used.  If an LND on-chain wallet was extensively used, then users may want to increase this value.  2500 is the default.",
        default: null,
        required: false,
        min: 1,
        integer: true,
        units: 'addresses',
      }),
      'payments-expiration-grace-period': Value.number({
        name: 'Payments Expiration Grace Period',
        description:
          'A period to wait before for closing channels with outgoing htlcs that have timed out and are a result of this nodes instead payment. In addition to our current block based deadline, is specified this grace period will also be taken into account.',
        default: parseInt(paymentsExpirationGracePeriod.split('s')[0]),
        required: true,
        min: 1,
        integer: true,
        units: 'seconds',
      }),
      'default-remote-max-htlcs': Value.number({
        name: 'Maximum Remote HTLCs',
        description:
          'The default max_htlc applied when opening or accepting channels. This value limits the number of concurrent HTLCs that the remote party can add to the commitment. The maximum possible value is 483.',
        default: defaultRemoteMaxHtlcs,
        required: true,
        min: 1,
        max: 483,
        integer: true,
        units: 'htlcs',
      }),
      'max-channel-fee-allocation': Value.number({
        name: 'Maximum Channel Fee Allocation',
        description:
          "The maximum percentage of total funds that can be allocated to a channel's commitment fee. This only applies for the initiator of the channel.",
        default: maxChannelFeeAllocation,
        required: true,
        min: 0.1,
        max: 1,
        integer: false,
      }),
      'max-pending-channels': Value.number({
        name: 'Maximum Pending Channels',
        description:
          'The maximum number of incoming pending channels permitted per peer.',
        default: maxpendingchannels,
        required: true,
        min: 0,
        integer: true,
      }),
      'max-commit-fee-rate-anchors': Value.number({
        name: 'Maximum Commitment Fee for Anchor Channels',
        description:
          'The maximum fee rate in sat/vbyte that will be used for commitments of channels of the anchors type. Must be large enough to ensure transaction propagation.',
        default: maxCommitFeeRateAnchors,
        required: true,
        min: 1,
        integer: true,
      }),
      'gc-canceled-invoices-on-startup': Value.toggle({
        name: 'Cleanup Canceled Invoices on Startup',
        default: gcCanceledInvoicesOnStartup,
        description:
          'If true, LND will attempt to garbage collect canceled invoices upon start.',
      }),
      'allow-circular-route': Value.toggle({
        name: 'Allow Circular Route',
        default: allowCircularRoute,
        description:
          'If true, LND will allow htlc forwards that arrive and depart on the same channel.',
      }),
    }),
  ),
})

export const general = sdk.Action.withInput(
  // id
  'general',

  // metadata
  async ({ effects }) => ({
    name: 'General Settings',
    description: 'General settings for your LND node',
    warning: null,
    allowedStatuses: 'any',
    group: 'conf',
    visibility: 'enabled',
  }),

  // form input specification
  generalSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<PartialGeneralSpec> {
  const lndConf = (await lndConfFile.read.const(effects))!
  const recovery_window = await sdk.store
    .getOwn(effects, sdk.StorePath.recoveryWindow)
    .const()

  const generalSettings: PartialGeneralSpec = {
    alias: lndConf.alias,
    color: lndConf.color,
    'accept-keysend': lndConf['accept-keysend'],
    'accept-amp': lndConf['accept-amp'],
    'reject-htlc': lndConf.rejecthtlc,
    'min-chan-size': lndConf.minchansize,
    'max-chan-size': lndConf.maxchansize,
    tor: {
      'use-tor-only': !lndConf['tor.skip-proxy-for-clearnet-targets'],
      'stream-isolation': lndConf['tor.streamisolation'],
    },
    advanced: {
      'debug-level': lndConf.debuglevel,
      'recovery-window': recovery_window,
      'payments-expiration-grace-period': lndConf[
        'payments-expiration-grace-period'
      ]?.split('s')[0]
        ? parseInt(lndConf['payments-expiration-grace-period']?.split('s')[0])
        : parseInt(
            lndConfDefaults['payments-expiration-grace-period'].split('s')[0],
          ),
      'default-remote-max-htlcs': lndConf['default-remote-max-htlcs'],
      'max-channel-fee-allocation': lndConf['max-channel-fee-allocation'],
      'max-pending-channels': lndConf.maxpendingchannels,
      'max-commit-fee-rate-anchors': lndConf['max-commit-fee-rate-anchors'],
      'gc-canceled-invoices-on-startup':
        lndConf['gc-canceled-invoices-on-startup'],
      'allow-circular-route': lndConf['allow-circular-route'],
    },
  }
  return generalSettings
}

async function write(effects: any, input: GeneralSpec) {
  const {
    'allow-circular-route': allowCircularRoute,
    'debug-level': debugLevel,
    'default-remote-max-htlcs': defaultRemoteMaxHtlcs,
    'gc-canceled-invoices-on-startup': gcCanceledInvoicesOnStartup,
    'max-channel-fee-allocation': maxChannelFeeAllocation,
    'max-commit-fee-rate-anchors': maxCommitFeeRateAnchors,
    'max-pending-channels': maxPendingChannels,
    'payments-expiration-grace-period': paymentsExpirationGracePeriod,
    'recovery-window': recoveryWindow,
  } = input.advanced

  await sdk.store.setOwn(effects, sdk.StorePath.recoveryWindow, recoveryWindow)

  const generalSettings = {
    'alias': input.alias ? input.alias : lndConfDefaults.alias,
    'color': input.color,
    'accept-keysend': input['accept-keysend'],
    'accept-amp': input['accept-amp'],
    rejecthtlc: input['reject-htlc'],
    minchansize: input['min-chan-size'] ? input['min-chan-size'] : lndConfDefaults.minchansize,
    maxchansize: input['max-chan-size'] ? input['max-chan-size'] : lndConfDefaults.maxchansize,
    'tor.skip-proxy-for-clearnet-targets': !input.tor['use-tor-only'],
    'tor.streamisolation': input.tor['stream-isolation'],
    debuglevel: debugLevel,
    'payments-expiration-grace-period': `${paymentsExpirationGracePeriod}s`,
    'default-remote-max-htlcs': defaultRemoteMaxHtlcs,
    'max-channel-fee-allocation': maxChannelFeeAllocation,
    maxpendingchannels: maxPendingChannels,
    'max-commit-fee-rate-anchors': maxCommitFeeRateAnchors,
    'gc-canceled-invoices-on-startup': gcCanceledInvoicesOnStartup,
    'allow-circular-route': allowCircularRoute,
  }

  await lndConfFile.merge(effects, generalSettings)
}

type GeneralSpec = typeof generalSpec._TYPE
type PartialGeneralSpec = typeof generalSpec._PARTIAL
