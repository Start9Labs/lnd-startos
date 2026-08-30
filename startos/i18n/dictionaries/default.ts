export const DEFAULT_LANG = 'en_US'

const dict = {
  // main.ts
  'Starting LND!': 0,
  'Sync Complete': 1,
  'LND is synced to chain and graph.': 2,
  'Network and Graph Sync Progress': 4,
  'Synced to chain and graph': 5,
  'Syncing to chain': 6,
  'Syncing to graph and chain': 8,
  'Waiting for peers': 303,
  'Syncing to graph': 304,
  'Graph sync has not completed in ${minutes} min (peers: ${peers}). LND retries with another peer every hour.': 299,
  'LND is starting…': 9,
  'Backup Restoration Detected': 10,
  'Node Reachability': 11,
  'Your node can peer with other nodes, but other nodes cannot peer with you. Optionally add a Tor domain, public domain, or public IP address to change this behavior.': 12,
  'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.': 13,

  // main.ts — the import phase
  'Wallet Import': 292,
  'Importing LND data from ${source}. Stopping the origin node and copying its data can take hours on a large node.': 293,
  'Imported LND data from ${source}.': 294,
  'The wallet migration failed and needs attention': 295,

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
  'Watchtower - Server Info': 36,
  'Get your Tower Server URL': 37,
  'Watchtower Server must be enabled': 38,
  'Tower Info': 39,
  'Sharing this URL with other LND nodes will allow them to use your server as a watchtower.': 40,
  'Error fetching tower info': 41,

  // shared
  'Aezeed Cipher Seed': 42,

  // actions/revoke-macaroons.ts
  'Revoke Macaroons': 45,
  'Revokes every macaroon this node has issued by rotating the root key they are signed with, then restarts LND to write fresh ones. Deleting macaroon files alone does not revoke them, so use this if one may have been copied or exposed.': 46,
  'This revokes every existing macaroon. Any service connected to LND loses access until it picks up the new macaroon, and may need to be restarted.': 47,
  'LND is restarting to generate a new macaroon root key. Every macaroon issued before now becomes invalid, and fresh ones are written once the wallet unlocks.': 48,

  // actions/resetTxns.ts
  'Reset Wallet Transactions': 49,
  'Resetting wallet transactions on next startup. If LND is already running, it will be automatically reset now.': 50,
  "Resets the best synced height of the wallet back to its birthday, or genesis if the birthday isn't known. This is useful for picking up on-chain transactions that may have been missed by LND": 80,

  // actions/initializeWallet.ts
  'Initialize Wallet': 204,
  'Create a new LND wallet or migrate from another device': 205,
  'Initialization Method': 206,
  'Choose how to initialize your LND wallet. Start Fresh creates a new wallet. The migration options import an existing wallet from another node on your local network.': 207,
  'Start Fresh': 208,
  'Migrate from ${source}': 209,
  "IMPORTANT: Write down these 24 words and store them in a safe place — this is the ONLY time they will be displayed. The seed alone is NOT enough to recover your node: it restores ON-CHAIN funds only and has no knowledge of your channels. To recover funds locked in Lightning channels, you must ALSO keep StartOS backups, which include LND's Static Channel Backup. This is NOT a BIP-39 seed and cannot be used with wallets other than LND.": 210,
  'Your Umbrel was reached and its credentials verified.': 78,
  'Start LND to run the migration — LND stops the origin node, copies its data, and converts the database before coming online. On a large node this can take hours; watch its progress under Health Checks. Once the migration is complete, never run LND on the origin server again: two nodes sharing one seed leads to unpredictable behavior or loss of funds.': 296,
  'Umbrel Address': 83,
  'The IP address or hostname of your Umbrel (e.g. 192.168.1.9 or umbrel.local).': 84,
  'Umbrel Password': 85,
  'The password you use to log into your Umbrel dashboard or SSH': 86,
  'myNode Address': 285,
  'The IP address or hostname of your myNode (e.g. 192.168.1.7 or mynode.local).': 286,
  'myNode Password': 287,
  'The password for your myNode "admin" user — the one you use for SSH and for the myNode web interface.': 288,
  'Your myNode was reached and its credentials verified.': 289,

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
  'Skip for clearnet peers': 105,
  "Dial peers that are reachable on clearnet directly, skipping the Tor proxy. When off, all outbound peer connections — including clearnet-reachable ones — are routed through Tor, hiding your node's public IP address at the cost of performance.": 106,
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
  'Select between a local Bitcoin node and Neutrino as the backend for LND. As Neutrino involves reliance on third-party nodes it is advisable to use a local Bitcoin node instead. Once a local Bitcoin node is selected it is not supported to switch to Neutrino; however LND can always switch from Neutrino to a local Bitcoin node at a later time.': 142,
  'Local Bitcoin Node': 143,
  Neutrino: 144,

  // actions/config/autopilot.ts
  'Autopilot Settings': 60,
  'Edit the Autopilot settings in lnd.conf': 61,
  'Tor Settings': 260,
  'Edit the Tor settings in lnd.conf': 261,
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
  'Watchtower - Server': 65,
  'Enable Watchtower Server in lnd.conf': 66,
  "Setting the address to 'none' disables the watchtower server and permanently deletes the backup data it holds for the client nodes that rely on it. This cannot be undone.": 283,
  'External Address': 187,
  'No available address at which your watchtower can be reached by LND peers.': 188,
  "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.": 189,

  // actions/config/watchtowerClient.ts
  'Watchtower - Client': 67,
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
  'Origin Server Address': 213,
  'The LAN IP address or hostname of your old StartOS server (e.g. 192.168.1.9 or adjective-noun.local).': 214,
  'Master Password': 215,
  'The master password for your old StartOS server.': 216,
  'Failed to read the wallet password from the origin node.': 217,
  'Your old StartOS server was reached and its credentials verified.': 218,

  // actions/config — new config fields
  'Accept AMP': 219,
  'Accept Atomic Multi-Path spontaneous payments. AMP allows a single payment to be split across multiple channels for better reliability': 220,
  'The number of blocks subtracted from the incoming HTLC timelock for forwarded payments. Higher values are safer but may reduce routing competitiveness. Routing nodes commonly use 144 (approximately 24 hours)': 221,
  'The smallest channel size in satoshis that your node will accept. Increase this to reject tiny, uneconomical channels. The upstream default is 20,000 sats': 222,
  'The largest channel size in satoshis that your node will accept. To accept channels larger than ~0.167 BTC (16,777,215 sats), you must also enable Wumbo Channels': 223,
  'Wumbo Channels': 224,
  'Enable support for channels larger than ~0.167 BTC (16,777,215 sats). Both peers must have Wumbo enabled to open a large channel. Required if you set a Maximum Channel Size above 16,777,215': 225,
  'Max Pending Channels': 226,
  'The maximum number of incoming channel requests waiting to be confirmed per peer. Increase this if you want to allow peers to batch-open multiple channels with you': 227,
  'Allow a payment to arrive and depart through the same channel. Required for self-rebalancing tools such as Balance of Satoshis or circular rebalance scripts': 228,
  'Reject Push': 229,
  'Reject incoming channel open requests that include a non-zero push amount (where the opener gifts sats to your side). This can be used as a precaution against certain probing attacks': 230,
  'Cooperative Close Confirmation Target': 231,
  'The target number of blocks for cooperative channel close transactions. Lower values pay higher on-chain fees for faster confirmation. Higher values (e.g. 100-1000) can save fees when speed is not important': 232,
  'Automatically compact the bolt database on startup. Compaction reclaims wasted disk space and can improve performance over time. Recommended for most nodes': 234,
  'Delete Canceled Invoices on Startup': 235,
  'Delete all canceled invoices when LND starts. This reduces database size and improves performance': 236,
  'Delete Canceled Invoices Immediately': 237,
  'Delete canceled invoices immediately as they are canceled, rather than waiting for startup cleanup': 238,
  'Stagger Initial Reconnect': 239,
  'Ignore Historical Gossip Filters': 241,
  'Do not serve historical gossip data to peers that request it. Saves bandwidth and CPU at the cost of being less helpful to peers bootstrapping their network graph': 242,
  'Strict Graph Pruning': 243,
  'Prune a channel from the network graph if even one of its edges (direction announcements) is stale. Results in a smaller, more accurate routing graph': 244,

  'Enable support for zero-confirmation channels. Requires option-scid-alias to also be enabled. Zero-conf channels can be used immediately without waiting for on-chain confirmations. Required for Lightning Loop and Pool integration': 251,

  // actions — new action names/descriptions
  'Routing Fees': 245,
  'Configure the default fees and timelock delta applied to forwarded payments on your channels': 246,
  'Channel Settings': 247,
  'Configure channel acceptance policies including size limits, pending channel limits, and close behavior': 248,
  Performance: 249,
  'Performance and maintenance settings for database compaction, invoice cleanup, and network efficiency': 250,

  // main.ts — ready check
  'LND Server': 252,
  'LND is ready': 253,

  // Footnote label for showing upstream default value
  Default: 254,

  // Refreshed description after moving upstream default into the footnote
  'The smallest channel size in satoshis that your node will accept. Increase this to reject tiny, uneconomical channels.': 255,

  'Enable Tor': 256,
  "Route LND's outbound peer connections through the Tor SOCKS proxy. When disabled, LND uses the host's normal network stack. Enabling this makes Tor a required running dependency. Disable if Tor is unavailable or is interfering with wallet sync (btcwallet's embedded rescanner does not always respect this setting, so sync can stall on Tor-only environments).": 257,

  // Channel Settings — Taproot Overlay (Taproot Assets)
  'Experimental Taproot Overlay Channels': 258,
  'Enable support for taproot overlay channels — taproot channels carrying custom Taproot Assets data alongside Bitcoin payments. Used by the Taproot Assets daemon (tapd). Requires Experimental Taproot Channels to also be enabled.': 259,

  // Reachability — Custom External Host
  'Custom External Host': 262,
  'Advertise an additional public address (e.g. a Tunnelsats or VPN endpoint) alongside your Tor and StartOS-managed addresses': 263,
  'An additional public domain at which your node can be reached, advertised to the network alongside any Tor or StartOS-managed addresses. Use this for an external tunnel or VPN endpoint, such as Tunnelsats. Enter a domain, optionally followed by a port (e.g. example.com:22222); the port defaults to 9735. A static IP does not belong here — StartOS advertises detected public IPs automatically.': 264,
  'Must be a domain name, optionally followed by :port (e.g. example.com:9735).': 265,
  'LND re-resolves this address periodically, so it also works for dynamic-DNS tunnels.': 266,

  // Auto-Configure action
  'Auto-Configure': 269,
  'Automatically configure lnd.conf for the needs of another service': 270,
  'These fields were provided by a task and cannot be edited': 271,

  // sqliteBackend.ts — bolt → SQLite migration progress phases
  'Finalizing database schema': 272,
  'Copying database to SQLite': 273,
  'Database Conversion': 290,
  'Converted to the SQLite database backend.': 291,

  // lnd.conf.ts — Debug Level setting + level labels
  Trace: 274,
  Debug: 275,
  Info: 276,
  Warning: 277,
  Error: 278,
  Critical: 279,
  'Info (quiet wallet)': 280,
  'Debug Level': 281,
  'Logging level for all subsystems. Trace is the most verbose, Critical is the least.': 282,
  'Spread reconnection attempts to your peers over the first 30 seconds after startup, instead of dialing them all at once. The first 10 peers always reconnect immediately, so this has no effect below 10 channel peers': 300,
  'Graph Cache Duration': 301,
  'How long to reuse the answer to a full network graph query. Apps that display the Lightning network — Mempool and Ride The Lightning — re-run this query on every refresh, and each run reads the whole graph out of the database. Reusing the answer keeps repeated or simultaneous refreshes from stalling gossip and payments. Set to 0 to read the graph fresh every time.': 302,

  // Security group
  Security: 1000,
  'Wallet not initialized': 1001,
  UNLOCKED: 1002,
  'Display your Aezeed Cipher Seed.': 1003,
  'Aezeed Cipher Seed - Backup': 1004,
  'Confirm you have backed up your Aezeed Cipher Seed.': 1005,
  CONFIRMED: 1006,
  'Aezeed Seed Backup Status': 1007,
  'Seed backup not confirmed': 1008,
  DELETED: 1009,
  'Aezeed Cipher Seed - Delete': 1010,
  'Status: Confirmed': 1011,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
