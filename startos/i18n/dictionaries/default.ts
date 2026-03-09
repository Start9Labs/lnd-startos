export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting LND!': 0,
  'REST Interface': 1,
  'The REST interface is ready to accept connections': 2,
  'The REST Interface is not ready': 3,
  'Network and Graph Sync Progress': 4,
  'Synced to chain and graph': 5,
  'Syncing to chain': 6,
  'Syncing to graph': 7,
  'Syncing to graph and chain': 8,
  'LND is starting…': 9,
  'Backup Restoration Detected': 10,
  'Node Reachability': 11,
  'Your node can peer with other nodes, but other nodes cannot peer with you. Optionally add a Tor domain, public domain, or public IP address to change this behavior.': 12,
  'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.': 13,

  // interfaces.ts
  'REST LND Connect': 14,
  'Used for REST connections': 15,
  'gRPC LND Connect': 16,
  'Used for gRPC connections': 17,
  'Peer Interface': 18,
  'Used for connecting with peers': 19,
  Watchtower: 20,
  'Allows peers to use your watchtower server': 21,

  // action groups
  Configuration: 22,

  // actions/nodeInfo.ts
  'Node Info': 23,
  'Get info about your LND node': 24,
  'Information about your LND node.': 25,
  'Node Alias': 26,
  'The friendly identifier for your node': 27,
  'Node Id': 28,
  'The node identifier that other nodes can use to connect to this node': 29,
  'Node URI(s)': 30,
  'URI(s) to allow other nodes to peer with your node': 31,
  'Node URI': 32,
  'No Peer Addresses found': 33,
  'Add a Peer URL in LND > Dashboard > Peer Interface > Add': 34,
  'Error fetching node info': 35,

  // actions/towerInfo.ts
  'Watchtower Server Info': 36,
  'Get your Tower Server URL': 37,
  'Watchtower Server must be enabled': 38,
  'Tower Info': 39,
  'Sharing this URL with other LND nodes will allow them to use your server as a watchtower.': 40,
  'Error fetching tower info': 41,

  // shared
  'Aezeed Cipher Seed': 42,

  // actions/recreate-macaroons.ts
  'Recreate Macaroons': 45,
  'Deletes current macaroons, and restarts LND to recreate all macaroons.': 46,
  'This will delete and recreate all existing macaroon files, so you may need to restart other services using LND.': 47,
  'Existing macaroons have been deleted and fresh macaroons will be created on next startup. If LND is already running, it will be restarted now': 48,

  // actions/resetTxns.ts
  'Reset Wallet Transactions': 49,
  'Resetting wallet transactions on next startup. If LND is already running, it will be automatically reset now.': 50,
  "Resets the best synced height of the wallet back to its birthday, or genesis if the birthday isn't known. This is useful for picking up on-chain transactions that may have been missed by LND": 80,

  // actions/initializeWallet.ts
  'Initialize Wallet': 204,
  'Create a new LND wallet or migrate from another device': 205,
  'Initialization Method': 206,
  'Choose how to initialize your LND wallet. Start Fresh creates a new wallet. Migrate from Umbrel or StartOS imports an existing wallet.': 207,
  'Start Fresh': 208,
  'Migrate from Umbrel': 209,
  'IMPORTANT: Write down these 24 words and store them in a safe place. This is the ONLY time they will be displayed. This seed can restore on-chain funds ONLY — it has no knowledge of channel state. This is NOT a BIP-39 seed and cannot be used with wallets other than LND.': 210,
  'Successfully Imported Umbrel Data. WARNING!!! With the Migration of LND complete, be sure to NEVER re-start your Umbrel using the same LND seed! You should never run two different lnd nodes with the same seed! This will lead to strange/unpredictable behavior or even loss of funds.': 78,
  'Umbrel Address': 83,
  'The IP address or hostname of your Umbrel (e.g. 192.168.1.9 or umbrel.local).': 84,
  'Umbrel Password': 85,
  'The password you use to log into your Umbrel dashboard or SSH': 86,

  // actions/config/general.ts
  'General Settings': 54,
  'General settings for your LND node': 55,
  Alias: 87,
  'The public, human-readable name of your Lightning node': 88,
  'Must be at least 1 character and no more than 32 characters': 89,
  Color: 90,
  'The public color dot of your Lightning node': 91,
  'Must be a valid 6 digit hexadecimal RGB value. The first two digits are red, middle two are green, and final two are blue': 92,
  'Accept Keysend': 93,
  'Allow others to send payments directly to your public key through keysend instead of having to get a new invoice': 94,
  'Accept Spontaneous AMPs': 95,
  'If enabled, spontaneous payments through AMP will be accepted. Payments to AMP invoices will be accepted regardless of this setting.': 96,
  'Reject Routing Requests': 97,
  "If true, LND will not forward any HTLCs that are meant as onward payments. This option will still allow LND to send HTLCs and receive HTLCs but lnd won't be used as a hop.": 98,
  'Minimum Channel Size': 99,
  'The smallest channel size that we should accept. Incoming channels smaller than this will be rejected.': 100,
  'Maximum Channel Size': 101,
  "The largest channel size that we should accept. Incoming channels larger than this will be rejected. For non-Wumbo channels this limit remains 16777215 satoshis by default as specified in BOLT-0002. For wumbo channels this limit is 1,000,000,000 satoshis (10 BTC). Set this config option explicitly to restrict your maximum channel size to better align with your risk tolerance.  Don't forget to enable Wumbo channels under 'Advanced,' if desired.": 102,
  'Use Tor for all traffic': 105,
  "Use the tor proxy even for connections that are reachable on clearnet. This will hide your node's public IP address, but will slow down your node's performance": 106,
  'Stream Isolation': 107,
  "Enable Tor stream isolation by randomizing user credentials for each connection. With this mode active, each connection will use a new circuit. This means that multiple applications (other than lnd) using Tor won't be mixed in with lnd's traffic. This option may not be used when 'Use Tor for all traffic' is disabled, since direct connections compromise source IP privacy by default.": 108,
  Advanced: 109,
  'Advanced Options': 110,
  'Log Verbosity': 111,
  'Sets the level of log filtration. Trace is the most verbose, Critical is the least.': 112,
  'Recovery Window': 113,
  "Optional address 'look-ahead' when scanning for used keys during an on-chain recovery.  For example, a value of 2 would mean LND would stop looking for funds after finding 2 consecutive addresses that were generated but never used.  If an LND on-chain wallet was extensively used, then users may want to increase this value. 2500 is the default.": 114,
  'Payments Expiration Grace Period': 115,
  'A period to wait before for closing channels with outgoing htlcs that have timed out and are a result of this nodes instead payment. In addition to our current block based deadline, is specified this grace period will also be taken into account.': 116,
  'Maximum Remote HTLCs': 117,
  'The default max_htlc applied when opening or accepting channels. This value limits the number of concurrent HTLCs that the remote party can add to the commitment. The maximum possible value is 483.': 118,
  'Maximum Channel Fee Allocation': 119,
  "The maximum percentage of total funds that can be allocated to a channel's commitment fee. This only applies for the initiator of the channel.": 120,
  'Maximum Pending Channels': 121,
  'The maximum number of incoming pending channels permitted per peer.': 122,
  'Maximum Commitment Fee for Anchor Channels': 123,
  'The maximum fee rate in sat/vbyte that will be used for commitments of channels of the anchors type. Must be large enough to ensure transaction propagation.': 124,
  'Cleanup Canceled Invoices on Startup': 125,
  'If true, LND will attempt to garbage collect canceled invoices upon start.': 126,
  'Allow Circular Route': 127,
  'If true, LND will allow htlc forwards that arrive and depart on the same channel.': 128,

  // actions/config/bitcoin.ts
  'Bitcoin Channel Configuration Settings': 56,
  'Configuration options for lightning network channel management operating over the Bitcoin network': 57,
  'Default Channel Confirmations': 129,
  "The default number of confirmations a channel must have before it's considered open. LND will require any incoming channel requests to wait this many confirmations before it considers the channel active. ": 130,
  'Minimum Incoming HTLC Size': 131,
  'The smallest HTLC LND will to accept on your channels, in millisatoshis. ': 132,
  'Minimum Outgoing HTLC Size': 133,
  'The smallest HTLC LND will send out on your channels, in millisatoshis. ': 134,
  'Routing Base Fee': 135,
  'The base fee in millisatoshi you will charge for forwarding payments on your channels. ': 136,
  'Routing Fee Rate': 137,
  'The fee rate used when forwarding payments on your channels. The total fee charged is the Base Fee + (amount * Fee Rate / 1000000), where amount is the forwarded amount. Measured in sats per million ': 138,
  'Time Lock Delta': 139,
  "The CLTV delta we will subtract from a forwarded HTLC's timelock value.": 140,

  // actions/config/backend.ts
  'Bitcoin Backend': 58,
  'Confirm the Bitcoin node to be used as the backend for LND': 59,
  'Select Bitcoin Node': 141,
  'Select between a local bitcoin node and Neutrino as the backend for LND. As Neutrino involves reliance on third-party nodes it is advisable to use either Core or Knots instead. Once Core or Knots are selected it is not supported to switch to Neutrino; however LND can always switch from Neutrino to Core/Knots at a later time.': 142,
  'Local Bitcoin Node': 143,
  Neutrino: 144,

  // actions/config/autopilot.ts
  'Autopilot Settings': 60,
  'Edit the Autopilot settings in lnd.conf': 61,
  'Enable Autopilot': 145,
  'If the autopilot agent should be active or not. The autopilot agent will attempt to AUTOMATICALLY OPEN CHANNELS to put your node in an advantageous position within the network graph.': 146,
  'DO NOT ENABLE AUTOPILOT IF YOU WANT TO MANAGE CHANNELS MANUALLY OR IF YOU DO NOT UNDERSTAND THIS FEATURE.': 147,
  Disabled: 148,
  Enabled: 149,
  Private: 150,
  "Whether the channels created by the autopilot agent should be private or not. Private channels won't be announced to the network.": 151,
  'Maximum Channels': 152,
  'The maximum number of channels that should be created.': 153,
  Allocation: 154,
  'The fraction of total funds that should be committed to automatic channel establishment. For example 60% means that 60% of the total funds available within the wallet should be used to automatically establish channels. The total amount of attempted channels will still respect the "Maximum Channels" parameter. ': 155,
  'The smallest channel that the autopilot agent should create.': 156,
  'The largest channel that the autopilot agent should create.': 157,
  'Minimum Confirmations': 158,
  'The minimum number of confirmations each of your inputs in funding transactions created by the autopilot agent must have.': 159,
  'Confirmation Target': 160,
  'The confirmation target (in blocks) for channels opened by autopilot.': 161,

  // actions/config/protocol.ts
  'Protocol Settings': 62,
  'Edit the Protocol settings in lnd.conf': 63,
  'Enable Wumbo Channels': 162,
  'If set, then lnd will create and accept requests for channels larger than 0.16 BTC ': 163,
  'Enable zero-conf Channels': 164,
  'Set to enable support for zero-conf channels. This requires the option-scid-alias flag to also be set. ': 165,
  'Zero-conf channels are channels that do not require confirmations to be used. Because of this, the fundee must trust the funder to not double-spend the channel and steal the balance of the channel.': 166,
  'Enable option-scid-alias Channels': 167,
  'Set to enable support for option_scid_alias channels, which can be referred to by an alias instead of the confirmed ShortChannelID. Additionally, is needed to open zero-conf channels. ': 168,
  'Disable Anchor Channels': 169,
  'Set to disable support for anchor commitments. Anchor channels allow you to determine your fees at close time by using a Child Pays For Parent transaction. ': 170,
  'Disable Script Enforced Channel Leases': 171,
  'Set to disable support for script enforced lease channel commitments. If not set, lnd will accept these channels by default if the remote channel party proposes them. Note that lnd will require 1 UTXO to be reserved for this channel type if it is enabled. Note: This may cause you to be unable to close a channel and your wallets may not understand why': 172,
  'Experimental Taproot Channels': 173,
  'Taproot Channels improve both privacy and cost efficiency of on-chain transactions. Note: Taproot Channels are experimental and only available for unannounced (private) channels at this time.': 174,

  // actions/config/sweeper.ts
  'Sweeper Settings': 64,
  "'Sweep' is a LND subservice that handles funds sent from dispute resolution contracts to the internal wallet. These config values help inform the sweeper to make decisions regarding how much it burns in on-chain fees in order to recover possibly contested outputs (HTLCs and Breach outputs).": 81,
  'These settings can result in loss of funds if poorly congifured. Refer to the LND documentation for more information: https://docs.lightning.engineering/lightning-network-tools/lnd/sweeper': 82,
  'Max Fee Rate': 175,
  'The max fee rate in sat/vb which can be used when sweeping funds. Setting this value too low can result in transactions not being confirmed in time, causing HTLCs to expire hence potentially losing funds.': 176,
  'Non-time-sensitive Sweep Confirmation Target': 177,
  'The conf target to use when sweeping non-time-sensitive outputs. This is useful for sweeping outputs that are not time-sensitive, and can be swept at a lower fee rate.': 178,
  'Budget to Local Ratio': 179,
  'The ratio (expressed as a decimal) of the value in to_local output to allocate as the budget to pay fees when sweeping it.': 180,
  'Anchor CPFP Ratio': 181,
  'The ratio of a special value to allocate as the budget to pay fees when CPFPing a force close tx using the anchor output. The special value is the sum of all time-sensitive HTLCs on this commitment subtracted by their budgets.': 182,
  'Time-Sensitive HTLC Budget Ratio': 183,
  'The ratio of the value in a time-sensitive (first-level) HTLC to allocate as the budget to pay fees when sweeping it.': 184,
  'Non-Time-Sensitive HTLC Budget Ratio': 185,
  'The ratio of the value in a non-time-sensitive (second-level) HTLC to allocate as the budget to pay fees when sweeping it.': 186,

  // actions/config/watchtowerServer.ts
  'Watchtower Server': 65,
  'Enable Watchtower Server in lnd.conf': 66,
  'External Address': 187,
  'No available address at which your watchtower can be reached by LND peers.': 188,
  "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.": 189,

  // actions/config/watchtowerClient.ts
  'Watchtower Client Settings': 67,
  'Edit the Watchtower Client settings in lnd.conf': 68,
  'Enable Watchtower Client': 190,
  'Enable or disable Watchtower Client': 191,
  'Add Watchtowers': 192,
  'Add URIs of Watchtowers to connect to.': 193,

  // actions/config/dbBolt.ts
  'DB Bolt Settings': 69,
  'Edit the DB Bolt settings in lnd.conf': 70,
  'Disallow Bolt DB Freelist Sync': 194,
  'If true, prevents the database from syncing its freelist to disk. ': 195,
  'Compact Database on Startup': 196,
  'Performs database compaction on startup. This is necessary to keep disk usage down over time at the cost of having longer startup times. ': 197,
  'Minimum Autocompaction Age for Bolt DB': 198,
  'How long ago (in hours) the last compaction of a database file must be for it to be considered for auto compaction again. Can be set to 0 to compact on every startup. ': 199,
  'Bolt DB Timeout': 200,
  'How long should LND try to open the database before giving up?': 201,

  // shared action results
  Success: 73,
  Failure: 74,

  // init/taskSetBackend.ts
  'LND needs to know what Bitcoin backend should be used': 75,

  // init/taskInitWallet.ts
  'LND needs a wallet to operate': 211,

  // dependencies.ts
  'LND requires ZMQ enabled in Bitcoin': 76,

  // actions/initializeWallet.ts (StartOS migration)
  'Migrate from StartOS': 212,
  'Origin Server Address': 213,
  'The LAN IP address or hostname of your old StartOS server (e.g. 192.168.1.9 or adjective-noun.local).': 214,
  'Master Password': 215,
  'The master password for your old StartOS server.': 216,
  'Failed to parse wallet password from origin StartOS server.': 217,
  'Successfully imported LND data from StartOS. WARNING: Do NOT start LND on the old server again with the same wallet. Running two LND nodes with the same seed will lead to unpredictable behavior or loss of funds.': 218,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
