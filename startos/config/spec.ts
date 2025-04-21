import { sdk } from '../sdk'
const { Config, List, Value, Variants } = sdk

export const configSpec = Config.of({
  alias: Value.text({
    name: 'Alias',
    required: false,
    description: 'The public, human-readable name of your Lightning node',
    warning: null,
    masked: false,
    placeholder: null,
    inputmode: 'text',
    patterns: [
      {
        regex: '.{1,32}',
        description:
          'Must be at least 1 character and no more than 32 characters',
      },
    ],
    minLength: null,
    maxLength: null,
  }),
  color: Value.text({
    name: 'Color',
    required: {
      default: {
        charset: 'a-f,0-9',
        len: 6,
      },
    },
    description: 'The public color dot of your Lightning node',
    warning: null,
    masked: false,
    placeholder: null,
    inputmode: 'text',
    patterns: [
      {
        regex: '[0-9a-fA-F]{6}',
        description:
          'Must be a valid 6 digit hexadecimal RGB value. The first two digits are red, middle two are green, and final two are\nblue\n',
      },
    ],
    minLength: null,
    maxLength: null,
  }),
  'accept-keysend': Value.toggle({
    name: 'Accept Keysend',
    default: true,
    description:
      'Allow others to send payments directly to your public key through keysend instead of having to get a new invoice\n',
    warning: null,
  }),
  'accept-amp': Value.toggle({
    name: 'Accept Spontaneous AMPs',
    default: false,
    description:
      'If enabled, spontaneous payments through AMP will be accepted. Payments to AMP\ninvoices will be accepted regardless of this setting.\n',
    warning: null,
  }),
  'rejecthtlc': Value.toggle({
    name: 'Reject Routing Requests',
    default: false,
    description:
      "If true, LND will not forward any HTLCs that are meant as onward payments. This option will still allow LND to send\nHTLCs and receive HTLCs but lnd won't be used as a hop.\n",
    warning: null,
  }),
  'minchansize': Value.number({
    name: 'Minimum Channel Size',
    description:
      'The smallest channel size that we should accept. Incoming channels smaller than this will be rejected.\n',
    warning: null,
    required: false,
    min: 1,
    max: 16777215,
    step: null,
    integer: true,
    units: 'satoshis',
    placeholder: null,
  }),
  'maxchansize': Value.number({
    name: 'Maximum Channel Size',
    description:
      "The largest channel size that we should accept. Incoming channels larger than this will be rejected.\nFor non-Wumbo channels this limit remains 16777215 satoshis by default as specified in BOLT-0002. For wumbo\nchannels this limit is 1,000,000,000 satoshis (10 BTC). Set this config option explicitly to restrict your maximum\nchannel size to better align with your risk tolerance.  Don't forget to enable Wumbo channels under 'Advanced,' if desired.\n",
    warning: null,
    required: false,
    min: 1,
    max: 1_000_000_000,
    step: null,
    integer: true,
    units: 'satoshis',
    placeholder: null,
  }),
  tor: Value.object(
    {
      name: 'Tor Config',
      description:
        'Advanced options for increasing privacy (at the cost of performance) using Tor\n',
      warning: null,
    },
    Config.of({
      'usetoronly': Value.toggle({
        name: 'Use Tor for all traffic',
        default: false,
        description:
          "Use the tor proxy even for connections that are reachable on clearnet. This will hide your node's public IP address, but will slow down your node's performance",
        warning: null,
      }),
      'streamisolation': Value.toggle({
        name: 'Stream Isolation',
        default: false,
        description:
          "Enable Tor stream isolation by randomizing user credentials for each connection. With this mode active, each connection will use a new circuit. This means that multiple applications (other than lnd) using Tor won't be mixed in with lnd's traffic.\nThis option may not be used when 'Use Tor for all traffic' is disabled, since direct connections compromise source IP privacy by default.",
        warning: null,
      }),
    }),
  ),
  bitcoind: Value.union(
    {
      name: 'Bitcoin Core',
      description:
        '<p>The Bitcoin Core node to connect to:</p><ul><li><strong>None</strong>: Use the light bitcoin backend built into LND, Neutrino. If using Neutrino, please switch to using Bitcoin Core as soon as possible. Neutrino uses the BIP157/8 light client protocol, which has security risks.</li><br><li><strong>Bitcoin Core</strong>: service installed on your server. Neutrino will also be used during IBD.</li></ul>',
      warning: null,

      // prettier-ignore
      required: {"default": "internal"},
    },
    Variants.of({
      none: { name: 'None (Built-in LND Neutrino)', spec: Config.of({}) },
      internal: {
        name: 'Bitcoin Core',
        spec: Config.of({
          user: /* TODO deal with point removed point "RPC Username" */ null as any,
          password:
            /* TODO deal with point removed point "RPC Password" */ null as any,
        }),
      },
    }),
  ),
  autopilot: Value.object(
    {
      name: 'Autopilot',
      description: 'Autopilot Settings',
      warning: null,
    },
    Config.of({
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
          "Whether the channels created by the autopilot agent should be private or not.\nPrivate channels won't be announced to the network.\n",
        warning: null,
      }),
      maxchannels: Value.number({
        name: 'Maximum Channels',
        description: 'The maximum number of channels that should be created.',
        warning: null,
        required: {
          default: 5,
        },
        min: 1,
        max: null,
        step: null,
        integer: true,
        units: null,
        placeholder: null,
      }),
      allocation: Value.number({
        name: 'Allocation',
        description:
          'The fraction of total funds that should be committed to automatic channel\nestablishment. For example 60% means that 60% of the total funds available\nwithin the wallet should be used to automatically establish channels. The total\namount of attempted channels will still respect the "Maximum Channels" parameter.\n',
        warning: null,
        required: {
          default: 60,
        },
        min: 1,
        max: 100,
        step: null,
        integer: false,
        units: '%',
        placeholder: null,
      }),
      'minchannelsize': Value.number({
        name: 'Minimum Channel Size',
        description:
          'The smallest channel that the autopilot agent should create.',
        warning: null,
        required: {
          default: 20000,
        },
        min: 0,
        max: null,
        step: null,
        integer: true,
        units: 'satoshis',
        placeholder: null,
      }),
      'maxchannelsize': Value.number({
        name: 'Maximum Channel Size',
        description:
          'The largest channel that the autopilot agent should create.',
        warning: null,
        required: {
          default: 16777215,
        },
        min: 0,
        max: null,
        step: null,
        integer: true,
        units: 'satoshis',
        placeholder: null,
      }),
      advanced: Value.object(
        {
          name: 'Advanced',
          description: 'Advanced Options',
          warning: null,
        },
        Config.of({
          'minconfirmations': Value.number({
            name: 'Minimum Confirmations',
            description:
              'The minimum number of confirmations each of your inputs in funding transactions\ncreated by the autopilot agent must have.\n',
            warning: null,
            required: {
              default: 1,
            },
            min: 0,
            max: null,
            step: null,
            integer: true,
            units: 'blocks',
            placeholder: null,
          }),
          'confirmationtarget': Value.number({
            name: 'Confirmation Target',
            description:
              'The confirmation target (in blocks) for channels opened by autopilot.',
            warning: null,
            required: {
              default: 1,
            },
            min: 0,
            max: null,
            step: null,
            integer: true,
            units: 'blocks',
            placeholder: null,
          }),
        }),
      ),
    }),
  ),
  watchtowers: Value.object(
    {
      name: 'Watchtowers',
      description:
        "Watchtower Settings: A watchtower is a feature of a Lightning node that allows you to watch a node for potential channel breaches (the watchtower server). This functionality comes bundled in LND, but needs to be specifically enabled. Two nodes can act as each other's watchtowers, meaning they simultaneously operate in server and client mode.",
      warning: null,
    },
    Config.of({
      'wtserver': Value.toggle({
        name: 'Enable Watchtower Server',
        default: false,
        description:
          'Allow other nodes to find your watchtower server on the network.',
        warning: null,
      }),
      'wtclient': Value.union(
        {
          name: 'Enable Watchtower Client',
          description: 'Enable or disable Watchtower Client',
          warning: null,

          // prettier-ignore
          required: {"default": "disabled"},
        },
        Variants.of({
          disabled: { name: 'Disabled', spec: Config.of({}) },
          enabled: {
            name: 'Enabled',
            spec: Config.of({
              'addwatchtowers': Value.list(
                List.text(
                  {
                    name: 'Add Watchtowers',
                    minLength: null,
                    maxLength: null,
                    default: [],
                    description: 'Add URIs of Watchtowers to connect to.',
                    warning: null,
                  },
                  {
                    masked: false,
                    placeholder: 'pubkey@host:9911',
                    patterns: [],
                    minLength: 1,
                    maxLength: null,
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
      warning: null,
    },
    Config.of({
      'debuglevel': Value.select({
        name: 'Log Verbosity',
        description:
          'Sets the level of log filtration. Trace is the most verbose, Critical is the least.\n',
        warning: null,
        required: {
          default: 'info',
        },
        values: {
          trace: 'trace',
          debug: 'debug',
          info: 'info',
          warn: 'warn',
          error: 'error',
          critical: 'critical',
        },
      } as const),
      'db.bolt.nofreelistsync': Value.toggle({
        name: 'Disallow Bolt DB Freelist Sync',
        default: false,
        description:
          'If true, prevents the database from syncing its freelist to disk.\n',
        warning: null,
      }),
      'db.bolt.auto-compact': Value.toggle({
        name: 'Compact Database on Startup',
        default: true,
        description:
          'Performs database compaction on startup. This is necessary to keep disk usage down over time at the cost of\nhaving longer startup times.\n',
        warning: null,
      }),
      'db.bolt.auto-compact-min-age': Value.number({
        name: 'Minimum Autocompaction Age for Bolt DB',
        description:
          'How long ago (in hours) the last compaction of a database file must be for it to be considered for auto\ncompaction again. Can be set to 0 to compact on every startup.\n',
        warning: null,
        required: {
          default: 168,
        },
        min: 0,
        max: null,
        step: null,
        integer: true,
        units: 'hours',
        placeholder: null,
      }),
      'db.bolt.dbtimeout': Value.number({
        name: 'Bolt DB Timeout',
        description:
          'How long should LND try to open the database before giving up?',
        warning: null,
        required: {
          default: 60,
        },
        min: 1,
        max: 86_400,
        step: null,
        integer: true,
        units: 'seconds',
        placeholder: null,
      }),
      'recoverywindow': Value.number({
        name: 'Recovery Window',
        description:
          "Optional address 'look-ahead' when scanning for used keys during an on-chain recovery.  For example, a value of 2 would mean LND would stop looking for funds after finding 2 consecutive addresses that were generated but never used.  If an LND on-chain wallet was extensively used, then users may want to increase this value.  2500 is the default.",
        warning: null,
        required: false,
        min: 1,
        max: null,
        step: null,
        integer: true,
        units: 'addresses',
        placeholder: null,
      }),
      'payments-expiration-grace-period': Value.number({
        name: 'Payments Expiration Grace Period',
        description:
          'A period to wait before for closing channels with outgoing htlcs that have timed out and are a result of this\nnodes instead payment. In addition to our current block based deadline, is specified this grace period will\nalso be taken into account.\n',
        warning: null,
        required: {
          default: 30,
        },
        min: 1,
        max: null,
        step: null,
        integer: true,
        units: 'seconds',
        placeholder: null,
      }),
      'default-remote-max-htlcs': Value.number({
        name: 'Maximum Remote HTLCs',
        description:
          'The default max_htlc applied when opening or accepting channels. This value limits the number of concurrent\nHTLCs that the remote party can add to the commitment. The maximum possible value is 483.\n',
        warning: null,
        required: {
          default: 483,
        },
        min: 1,
        max: 483,
        step: null,
        integer: true,
        units: 'htlcs',
        placeholder: null,
      }),
      'maxchannelfeeallocation': Value.number({
        name: 'Maximum Channel Fee Allocation',
        description:
          "The maximum percentage of total funds that can be allocated to a channel's commitment fee. This only applies for\nthe initiator of the channel.\n",
        warning: null,
        required: {
          default: 0.5,
        },
        min: 0.1,
        max: 1,
        step: null,
        integer: false,
        units: null,
        placeholder: null,
      }),
      'maxpendingchannels': Value.number({
        name: 'Maximum Pending Channels',
        description:
          'The maximum number of incoming pending channels permitted per peer.',
        warning: null,
        required: {
          default: 5,
        },
        min: 0,
        max: null,
        step: null,
        integer: true,
        units: null,
        placeholder: null,
      }),
      'max-commit-fee-rate-anchors': Value.number({
        name: 'Maximum Commitment Fee for Anchor Channels',
        description:
          'The maximum fee rate in sat/vbyte that will be used for commitments of channels of the anchors type. Must be\nlarge enough to ensure transaction propagation.\n',
        warning: null,
        required: {
          default: 100,
        },
        min: 1,
        max: null,
        step: null,
        integer: true,
        units: null,
        placeholder: null,
      }),
      'protocol.wumbo-channels': Value.toggle({
        name: 'Enable Wumbo Channels',
        default: false,
        description:
          'If set, then lnd will create and accept requests for channels larger than 0.16 BTC\n',
        warning: null,
      }),
      'protocol.zero-conf': Value.toggle({
        name: 'Enable zero-conf Channels',
        default: false,
        description:
          'Set to enable support for zero-conf channels. This requires the option-scid-alias flag to also be set.\n',
        warning:
          'Zero-conf channels are channels that do not require confirmations to be used. Because of this, the fundee must trust the funder to not double-spend the channel and steal the balance of the channel.',
      }),
      'protocol.option-scid-alias': Value.toggle({
        name: 'Enable option-scid-alias Channels',
        default: false,
        description:
          'Set to enable support for option_scid_alias channels, which can be referred to by an alias instead of the confirmed ShortChannelID. Additionally, is needed to open zero-conf channels.\n',
        warning: null,
      }),
      'protocol.no-anchors': Value.toggle({
        name: 'Disable Anchor Channels',
        default: false,
        description:
          'Set to disable support for anchor commitments. Anchor channels allow you to determine your fees at close time by\nusing a Child Pays For Parent transaction.\n',
        warning: null,
      }),
      'protocol.no-script-enforced-lease': Value.toggle({
        name: 'Disable Script Enforced Channel Leases',
        default: false,
        description:
          'Set to disable support for script enforced lease channel commitments. If not set, lnd will accept these channels by default if the remote channel party proposes them. Note that lnd will require 1 UTXO to be reserved for this channel type if it is enabled.\nNote: This may cause you to be unable to close a channel and your wallets may not understand why',
        warning: null,
      }),
      'protocol.simple-taproot-chans': Value.toggle({
        name: 'Experimental Taproot Channels',
        default: false,
        description:
          'Taproot Channels improve both privacy and cost efficiency of on-chain transactions. Note: Taproot Channels are experimental and only available for unannounced (private) channels at this time.',
        warning: null,
      }),
      'gc-canceled-invoices-on-startup': Value.toggle({
        name: 'Cleanup Canceled Invoices on Startup',
        default: false,
        description:
          'If true, LND will attempt to garbage collect canceled invoices upon start.\n',
        warning: null,
      }),
      'allow-circular-route': Value.toggle({
        name: 'Allow Circular Route',
        default: false,
        description:
          'If true, LND will allow htlc forwards that arrive and depart on the same channel.\n',
        warning: null,
      }),
      bitcoin: Value.object(
        {
          name: 'Bitcoin Channel Configuration',
          description:
            'Configuration options for lightning network channel management operating over the Bitcoin network',
          warning: null,
        },
        Config.of({
          'bitcoin.defaultchanconfs': Value.number({
            name: 'Default Channel Confirmations',
            description:
              "The default number of confirmations a channel must have before it's considered\nopen. LND will require any incoming channel requests to wait this many\nconfirmations before it considers the channel active.\n",
            warning: null,
            required: {
              default: 3,
            },
            min: 1,
            max: 6,
            step: null,
            integer: true,
            units: 'blocks',
            placeholder: null,
          }),
          'bitcoin.minhtlc': Value.number({
            name: 'Minimum Incoming HTLC Size',
            description:
              'The smallest HTLC LND will to accept on your channels, in millisatoshis.\n',
            warning: null,
            required: {
              default: 1,
            },
            min: 1,
            max: null,
            step: null,
            integer: true,
            units: 'millisatoshis',
            placeholder: null,
          }),
          'bitcoin.minhtlcout': Value.number({
            name: 'Minimum Outgoing HTLC Size',
            description:
              'The smallest HTLC LND will send out on your channels, in millisatoshis.\n',
            warning: null,
            required: {
              default: 1000,
            },
            min: 1,
            max: null,
            step: null,
            integer: true,
            units: 'millisatoshis',
            placeholder: null,
          }),
          'bitcoin.basefee': Value.number({
            name: 'Routing Base Fee',
            description:
              'The base fee in millisatoshi you will charge for forwarding payments on your\nchannels.\n',
            warning: null,
            required: {
              default: 1000,
            },
            min: 0,
            max: null,
            step: null,
            integer: true,
            units: 'millisatoshi',
            placeholder: null,
          }),
          'bitcoin.feerate': Value.number({
            name: 'Routing Fee Rate',
            description:
              'The fee rate used when forwarding payments on your channels. The total fee\ncharged is the Base Fee + (amount * Fee Rate / 1000000), where amount is the\nforwarded amount. Measured in sats per million\n',
            warning: null,
            required: {
              default: 1,
            },
            min: 1,
            max: 1_000_000,
            step: null,
            integer: true,
            units: 'sats per million',
            placeholder: null,
          }),
          'bitcoin.timelockdelta': Value.number({
            name: 'Time Lock Delta',
            description:
              "The CLTV delta we will subtract from a forwarded HTLC's timelock value.",
            warning: null,
            required: {
              default: 40,
            },
            min: 6,
            max: 144,
            step: null,
            integer: true,
            units: 'blocks',
            placeholder: null,
          }),
        }),
      ),
      sweeper: Value.object(
        {
          name: 'Sweeper Options',
          description:
            "'Sweep' is a LND subservice that handles funds sent from dispute resolution contracts to the internal wallet.\nThese config values help inform the sweeper to make decisions regarding how much it burns in on-chain fees in order to recover possibly contested outputs (HTLCs and Breach outputs).\n<b>WARNING: These settings can result in loss of funds if poorly congifured. Refer to the LND documentation for more information: https://docs.lightning.engineering/lightning-network-tools/lnd/sweeper</b>",
          warning: null,
        },
        Config.of({
          'sweeper.maxfeerate': Value.number({
            name: 'Max Fee Rate',
            description:
              'The max fee rate in sat/vb which can be used when sweeping funds. Setting this value too low can result in transactions not being confirmed in time, causing HTLCs to expire hence potentially losing funds.',
            warning: null,
            required: {
              default: 1000,
            },
            min: 1,
            max: null,
            step: null,
            integer: true,
            units: 'Sats/vb',
            placeholder: null,
          }),
          'sweeper.nodeadlineconftarget': Value.number({
            name: 'Non-time-sensitive Sweep Confirmation Target',
            description:
              'The conf target to use when sweeping non-time-sensitive outputs. This is useful for sweeping outputs that are not time-sensitive, and can be swept at a lower fee rate.',
            warning: null,
            required: {
              default: 1008,
            },
            min: 1,
            max: null,
            step: null,
            integer: true,
            units: 'Confirmations',
            placeholder: null,
          }),
          'sweeper.budget.tolocalratio': Value.number({
            name: 'Budget to Local Ratio',
            description:
              'The ratio (expressed as a decimal) of the value in to_local output to allocate as the budget to pay fees when sweeping it.',
            warning: null,
            required: {
              default: 0.5,
            },
            min: 0,
            max: 1,
            step: null,
            integer: false,
            units: null,
            placeholder: null,
          }),
          'sweeper.budget.anchorcpfpratio': Value.number({
            name: 'Anchor CPFP Ratio',
            description:
              'The ratio of a special value to allocate as the budget to pay fees when CPFPing a force close tx using the anchor output. The special value is the sum of all time-sensitive HTLCs on this commitment subtracted by their budgets.',
            warning: null,
            required: {
              default: 0.5,
            },
            min: 0,
            max: 1,
            step: null,
            integer: false,
            units: null,
            placeholder: null,
          }),
          'sweeper.budget.deadlinehtlcratio': Value.number({
            name: 'Time-Sensitive HTLC Budget Ratio',
            description:
              'The ratio of the value in a time-sensitive (first-level) HTLC to allocate as the budget to pay fees when sweeping it.',
            warning: null,
            required: {
              default: 0.5,
            },
            min: 0,
            max: 1,
            step: null,
            integer: false,
            units: null,
            placeholder: null,
          }),
          'sweeper.budget.nodeadlinehtlcratio': Value.number({
            name: 'Non-Time-Sensitive HTLC Budget Ratio',
            description:
              'The ratio of the value in a non-time-sensitive (second-level) HTLC to allocate as the budget to pay fees when sweeping it.',
            warning: null,
            required: {
              default: 0.5,
            },
            min: 0,
            max: 1,
            step: null,
            integer: false,
            units: null,
            placeholder: null,
          }),
        }),
      ),
    }),
  ),
})
