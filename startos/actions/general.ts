import { sdk } from '../sdk'

const { InputSpec, List, Value, Variants } = sdk

const inputSpec = InputSpec.of({
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
          'Must be a valid 6 digit hexadecimal RGB value. The first two digits are red, middle two are green, and final two are blue ',
      },
    ],
  }),
  'accept-keysend': Value.toggle({
    name: 'Accept Keysend',
    default: true,
    description:
      'Allow others to send payments directly to your public key through keysend instead of having to get a new invoice ',
  }),
  'accept-amp': Value.toggle({
    name: 'Accept Spontaneous AMPs',
    default: false,
    description:
      'If enabled, spontaneous payments through AMP will be accepted. Payments to AMP invoices will be accepted regardless of this setting. ',
  }),
  'reject-htlc': Value.toggle({
    name: 'Reject Routing Requests',
    default: false,
    description:
      "If true, LND will not forward any HTLCs that are meant as onward payments. This option will still allow LND to send HTLCs and receive HTLCs but lnd won't be used as a hop. ",
  }),
  'min-chan-size': Value.number({
    name: 'Minimum Channel Size',
    description:
      'The smallest channel size that we should accept. Incoming channels smaller than this will be rejected. ',
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
      "The largest channel size that we should accept. Incoming channels larger than this will be rejected. For non-Wumbo channels this limit remains 16777215 satoshis by default as specified in BOLT-0002. For wumbo channels this limit is 1,000,000,000 satoshis (10 BTC). Set this config option explicitly to restrict your maximum channel size to better align with your risk tolerance.  Don't forget to enable Wumbo channels under 'Advanced,' if desired. ",
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
        'Advanced options for increasing privacy (at the cost of performance) using Tor ',
    },
    InputSpec.of({
      'use-tor-only': Value.toggle({
        name: 'Use Tor for all traffic',
        default: false,
        description:
          "Use the tor proxy even for connections that are reachable on clearnet. This will hide your node's public IP address, but will slow down your node's performance",
      }),
      'stream-isolation': Value.toggle({
        name: 'Stream Isolation',
        default: false,
        description:
          "Enable Tor stream isolation by randomizing user credentials for each connection. With this mode active, each connection will use a new circuit. This means that multiple applications (other than lnd) using Tor won't be mixed in with lnd's traffic. This option may not be used when 'Use Tor for all traffic' is disabled, since direct connections compromise source IP privacy by default.",
      }),
    }),
  ),
  bitcoind: Value.union(
    {
      name: 'Bitcoin Core',
      description:
        '<p>The Bitcoin Core node to connect to:</p><ul><li><strong>None</strong>: Use the light bitcoin backend built into LND, Neutrino. If using Neutrino, please switch to using Bitcoin Core as soon as possible. Neutrino uses the BIP157/8 light client protocol, which has security risks.</li><br><li><strong>Bitcoin Core</strong>: service installed on your server. Neutrino will also be used during IBD.</li></ul>',
      default: 'internal',
    },
    Variants.of({
      none: { name: 'None (Built-in LND Neutrino)', spec: InputSpec.of({}) },
      internal: {
        name: 'Bitcoin Core',
        spec: InputSpec.of({}),
      },
    }),
  ),
  autopilot: Value.object(
    {
      name: 'Autopilot',
      description: 'Autopilot Settings',
    },
    InputSpec.of({
      enabled: Value.toggle({
        name: 'Enabled',
        default: false,
        description:
          'If the autopilot agent should be active or not. The autopilot agent will attempt to AUTOMATICALLY OPEN CHANNELS to put your node in an advantageous position within the network graph.',
        warning:
          'DO NOT ENABLE AUTOPILOT IF YOU WANT TO MANAGE CHANNELS MANUALLY OR IF YOU DO NOT UNDERSTAND THIS FEATURE.',
      }),
      private: Value.toggle({
        name: 'Private',
        default: false,
        description:
          "Whether the channels created by the autopilot agent should be private or not. Private channels won't be announced to the network. ",
      }),
      maxchannels: Value.number({
        name: 'Maximum Channels',
        description: 'The maximum number of channels that should be created.',
        default: 5,
        required: true,
        min: 1,
        integer: true,
      }),
      allocation: Value.number({
        name: 'Allocation',
        description:
          'The fraction of total funds that should be committed to automatic channel establishment. For example 60% means that 60% of the total funds available within the wallet should be used to automatically establish channels. The total amount of attempted channels will still respect the "Maximum Channels" parameter. ',
        default: 60,
        required: true,
        min: 0,
        max: 100,
        integer: false,
        units: '%',
      }),
      'min-channel-size': Value.number({
        name: 'Minimum Channel Size',
        description:
          'The smallest channel that the autopilot agent should create.',
        default: 20000,
        required: true,
        min: 0,
        integer: true,
        units: 'satoshis',
      }),
      'max-channel-size': Value.number({
        name: 'Maximum Channel Size',
        description:
          'The largest channel that the autopilot agent should create.',
        default: 16777215,
        required: true,
        min: 0,
        integer: true,
        units: 'satoshis',
      }),
      advanced: Value.object(
        {
          name: 'Advanced',
          description: 'Advanced Options',
        },
        InputSpec.of({
          'min-confirmations': Value.number({
            name: 'Minimum Confirmations',
            description:
              'The minimum number of confirmations each of your inputs in funding transactions created by the autopilot agent must have. ',
            default: 1,
            required: true,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
          'confirmation-target': Value.number({
            name: 'Confirmation Target',
            description:
              'The confirmation target (in blocks) for channels opened by autopilot.',
            default: 1,
            required: true,
            min: 0,
            integer: true,
            units: 'blocks',
          }),
        }),
      ),
    }),
  ),
  watchtowers: Value.object(
    {
      name: 'Watchtowers',
      description:
        'Watchtower Settings: A watchtower is a feature of a Lightning node that allows you to watch a node for potential channel breaches (the watchtower server). This functionality comes bundled in LND, but needs to be specifically enabled. Two nodes can act as each other’s watchtowers, meaning they simultaneously operate in server and client mode.',
    },
    InputSpec.of({
      'wt-server': Value.toggle({
        name: 'Enable Watchtower Server',
        default: false,
        description:
          'Allow other nodes to find your watchtower server on the network.',
      }),
      'wt-client': Value.union(
        {
          name: 'Enable Watchtower Client',
          description: 'Enable or disable Watchtower Client',
          default: 'disabled',
        },
        Variants.of({
          disabled: { name: 'Disabled', spec: InputSpec.of({}) },
          enabled: {
            name: 'Enabled',
            spec: InputSpec.of({
              'add-watchtowers': Value.list(
                List.text(
                  {
                    name: 'Add Watchtowers',
                    default: [],
                    description: 'Add URIs of Watchtowers to connect to.',
                    minLength: 1,
                  },
                  {
                    placeholder: 'pubkey@host:9911',
                    patterns: [],
                  },
                ),
              ),
            }),
          },
        }),
      ),
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
          'Sets the level of log filtration. Trace is the most verbose, Critical is the least. ',
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
      'db-bolt-no-freelist-sync': Value.toggle({
        name: 'Disallow Bolt DB Freelist Sync',
        default: false,
        description:
          'If true, prevents the database from syncing its freelist to disk. ',
      }),
      'db-bolt-auto-compact': Value.toggle({
        name: 'Compact Database on Startup',
        default: true,
        description:
          'Performs database compaction on startup. This is necessary to keep disk usage down over time at the cost of having longer startup times. ',
      }),
      'db-bolt-auto-compact-min-age': Value.number({
        name: 'Minimum Autocompaction Age for Bolt DB',
        description:
          'How long ago (in hours) the last compaction of a database file must be for it to be considered for auto compaction again. Can be set to 0 to compact on every startup. ',
        default: 168,
        required: true,
        min: 0,
        integer: true,
        units: 'hours',
      }),
      'db-bolt-db-timeout': Value.number({
        name: 'Bolt DB Timeout',
        description:
          'How long should LND try to open the database before giving up?',
        default: 60,
        required: true,
        min: 0,
        max: 86400,
        integer: true,
        units: 'seconds',
      }),
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
          'A period to wait before for closing channels with outgoing htlcs that have timed out and are a result of this nodes instead payment. In addition to our current block based deadline, is specified this grace period will also be taken into account. ',
        default: 30,
        required: true,
        min: 1,
        integer: true,
        units: 'seconds',
      }),
      'default-remote-max-htlcs': Value.number({
        name: 'Maximum Remote HTLCs',
        description:
          'The default max_htlc applied when opening or accepting channels. This value limits the number of concurrent HTLCs that the remote party can add to the commitment. The maximum possible value is 483. ',
        default: 483,
        required: true,
        min: 1,
        max: 483,
        integer: true,
        units: 'htlcs',
      }),
      'max-channel-fee-allocation': Value.number({
        name: 'Maximum Channel Fee Allocation',
        description:
          "The maximum percentage of total funds that can be allocated to a channel's commitment fee. This only applies for the initiator of the channel. ",
        default: 0.5,
        required: true,
        min: 0.1,
        max: 1,
        integer: false,
      }),
      'max-pending-channels': Value.number({
        name: 'Maximum Pending Channels',
        description:
          'The maximum number of incoming pending channels permitted per peer.',
        default: 5,
        required: true,
        min: 0,
        integer: true,
      }),
      'max-commit-fee-rate-anchors': Value.number({
        name: 'Maximum Commitment Fee for Anchor Channels',
        description:
          'The maximum fee rate in sat/vbyte that will be used for commitments of channels of the anchors type. Must be large enough to ensure transaction propagation. ',
        default: 100,
        required: true,
        min: 1,
        integer: true,
      }),
      'protocol-wumbo-channels': Value.toggle({
        name: 'Enable Wumbo Channels',
        default: false,
        description:
          'If set, then lnd will create and accept requests for channels larger than 0.16 BTC ',
      }),
      'protocol-zero-conf': Value.toggle({
        name: 'Enable zero-conf Channels',
        default: false,
        description:
          'Set to enable support for zero-conf channels. This requires the option-scid-alias flag to also be set. ',
        warning:
          'Zero-conf channels are channels that do not require confirmations to be used. Because of this, the fundee must trust the funder to not double-spend the channel and steal the balance of the channel.',
      }),
      'protocol-option-scid-alias': Value.toggle({
        name: 'Enable option-scid-alias Channels',
        default: false,
        description:
          'Set to enable support for option_scid_alias channels, which can be referred to by an alias instead of the confirmed ShortChannelID. Additionally, is needed to open zero-conf channels. ',
      }),
      'protocol-no-anchors': Value.toggle({
        name: 'Disable Anchor Channels',
        default: false,
        description:
          'Set to disable support for anchor commitments. Anchor channels allow you to determine your fees at close time by using a Child Pays For Parent transaction. ',
      }),
      'protocol-disable-script-enforced-lease': Value.toggle({
        name: 'Disable Script Enforced Channel Leases',
        default: false,
        description:
          'Set to disable support for script enforced lease channel commitments. If not set, lnd will accept these channels by default if the remote channel party proposes them. Note that lnd will require 1 UTXO to be reserved for this channel type if it is enabled. Note: This may cause you to be unable to close a channel and your wallets may not understand why',
      }),
      'protocol-simple-taproot-chans': Value.toggle({
        name: 'Experimental Taproot Channels',
        default: false,
        description:
          'Taproot Channels improve both privacy and cost efficiency of on-chain transactions. Note: Taproot Channels are experimental and only available for unannounced (private) channels at this time.',
      }),
      'gc-canceled-invoices-on-startup': Value.toggle({
        name: 'Cleanup Canceled Invoices on Startup',
        default: false,
        description:
          'If true, LND will attempt to garbage collect canceled invoices upon start. ',
      }),
      'allow-circular-route': Value.toggle({
        name: 'Allow Circular Route',
        default: false,
        description:
          'If true, LND will allow htlc forwards that arrive and depart on the same channel. ',
      }),
      bitcoin: Value.object(
        {
          name: 'Bitcoin Channel Configuration',
          description:
            'Configuration options for lightning network channel management operating over the Bitcoin network',
        },
        InputSpec.of({
          'default-channel-confirmations': Value.number({
            name: 'Default Channel Confirmations',
            description:
              "The default number of confirmations a channel must have before it's considered open. LND will require any incoming channel requests to wait this many confirmations before it considers the channel active. ",
            default: 3,
            required: true,
            min: 1,
            max: 6,
            integer: true,
            units: 'blocks',
          }),
          'min-htlc': Value.number({
            name: 'Minimum Incoming HTLC Size',
            description:
              'The smallest HTLC LND will to accept on your channels, in millisatoshis. ',
            default: 1,
            required: true,
            min: 1,
            integer: true,
            units: 'millisatoshis',
          }),
          'min-htlc-out': Value.number({
            name: 'Minimum Outgoing HTLC Size',
            description:
              'The smallest HTLC LND will send out on your channels, in millisatoshis. ',
            default: 1000,
            required: true,
            min: 1,
            integer: true,
            units: 'millisatoshis',
          }),
          'base-fee': Value.number({
            name: 'Routing Base Fee',
            description:
              'The base fee in millisatoshi you will charge for forwarding payments on your channels. ',
            default: 1000,
            required: true,
            min: 0,
            integer: true,
            units: 'millisatoshi',
          }),
          'fee-rate': Value.number({
            name: 'Routing Fee Rate',
            description:
              'The fee rate used when forwarding payments on your channels. The total fee charged is the Base Fee + (amount * Fee Rate / 1000000), where amount is the forwarded amount. Measured in sats per million ',
            default: 1,
            required: true,
            min: 0,
            max: 1000000,
            integer: true,
            units: 'sats per million',
          }),
          'time-lock-delta': Value.number({
            name: 'Time Lock Delta',
            description:
              "The CLTV delta we will subtract from a forwarded HTLC's timelock value.",
            default: 40,
            required: true,
            min: 6,
            max: 144,
            integer: true,
            units: 'blocks',
          }),
        }),
      ),
      sweeper: Value.object(
        {
          name: 'Sweeper Options',
          description:
            "'Sweep' is a LND subservice that handles funds sent from dispute resolution contracts to the internal wallet. These config values help inform the sweeper to make decisions regarding how much it burns in on-chain fees in order to recover possibly contested outputs (HTLCs and Breach outputs). <b>WARNING: These settings can result in loss of funds if poorly congifured. Refer to the LND documentation for more information: https://docs.lightning.engineering/lightning-network-tools/lnd/sweeper</b>",
        },
        InputSpec.of({
          'sweeper-maxfeerate': Value.number({
            name: 'Max Fee Rate',
            description:
              'The max fee rate in sat/vb which can be used when sweeping funds. Setting this value too low can result in transactions not being confirmed in time, causing HTLCs to expire hence potentially losing funds.',
            default: 1000,
            required: true,
            min: 1,
            integer: true,
            units: 'Sats/vb',
          }),
          'sweeper-nodeadlineconftarget': Value.number({
            name: 'Non-time-sensitive Sweep Confirmation Target',
            description:
              'The conf target to use when sweeping non-time-sensitive outputs. This is useful for sweeping outputs that are not time-sensitive, and can be swept at a lower fee rate.',
            default: 1008,
            required: true,
            min: 1,
            integer: true,
            units: 'Confirmations',
          }),
          'sweeper-budget-tolocalratio': Value.number({
            name: 'Budget to Local Ratio',
            description:
              'The ratio (expressed as a decimal) of the value in to_local output to allocate as the budget to pay fees when sweeping it.',
            default: 0.5,
            required: true,
            min: 0,
            max: 1,
            integer: false,
          }),
          'sweeper-budget-anchorcpfpratio': Value.number({
            name: 'Anchor CPFP Ratio',
            description:
              'The ratio of a special value to allocate as the budget to pay fees when CPFPing a force close tx using the anchor output. The special value is the sum of all time-sensitive HTLCs on this commitment subtracted by their budgets.',
            default: 0.5,
            required: true,
            min: 0,
            max: 1,
            integer: false,
          }),
          'sweeper-budget-deadlinehtlcratio': Value.number({
            name: 'Time-Sensitive HTLC Budget Ratio',
            description:
              'The ratio of the value in a time-sensitive (first-level) HTLC to allocate as the budget to pay fees when sweeping it.',
            default: 0.5,
            required: true,
            min: 0,
            max: 1,
            integer: false,
          }),
          'sweeper-budget-nodeadlinehtlcratio': Value.number({
            name: 'Non-Time-Sensitive HTLC Budget Ratio',
            description:
              'The ratio of the value in a non-time-sensitive (second-level) HTLC to allocate as the budget to pay fees when sweeping it.',
            default: 0.5,
            required: true,
            min: 0,
            max: 1,
            integer: false,
          }),
        }),
      ),
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
    group: null,
    visibility: 'enabled',
  }),

  // form input specification
  inputSpec,

  // optionally pre-fill the input form
  async ({ effects }) => {},

  // the execution function
  async ({ effects, input }) => {},
)
