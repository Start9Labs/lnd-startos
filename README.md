<p align="center">
  <img src="icon.svg" alt="LND Logo" width="21%">
</p>

# LND on StartOS

> Everything not listed in this document should behave the same as upstream
> LND. If a feature, setting, or behavior is not mentioned
> here, the upstream documentation is accurate and fully applicable.

A complete implementation of a Lightning Network node by [Lightning Labs](https://lightning.engineering/). See the [upstream repo](https://github.com/lightningnetwork/lnd) for general LND documentation.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Configuration Management](#configuration-management)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Actions (StartOS UI)](#actions-startos-ui)
- [Backups and Restore](#backups-and-restore)
- [Health Checks](#health-checks)
- [Dependencies](#dependencies)
- [Limitations and Differences](#limitations-and-differences)
- [What Is Unchanged from Upstream](#what-is-unchanged-from-upstream)
- [Contributing](#contributing)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

| Property      | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Image         | Built from `./Dockerfile`: `lightninglabs/lnd` + the `lndinit` binary  |
| Architectures | x86_64, aarch64                                                        |
| Entrypoint    | `lnd` (default upstream)                                               |

`lndinit` is added solely for the offline bolt → SQLite database conversion (see [Database backend](#database-backend)); the `lnd` binary and runtime are otherwise the upstream image.

## Volume and Data Layout

| Volume | Mount Point  | Purpose                                     |
| ------ | ------------ | ------------------------------------------- |
| `main` | `/root/.lnd` | All LND data (wallet, channels, DB, config) |

StartOS-specific files on the `main` volume:

| File                   | Purpose                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `store.json`           | Persistent StartOS state: wallet password, Aezeed cipher seed, restore/reset flags, watchtower clients, custom external hosts |
| `startup-flags.json`   | Per-run flags read with `.once` (so writes don't restart the service): reset-wallet-transactions, restore, the **Sync Complete** notified flag, and bolt→SQLite migration progress (`dbSchemaFinalized`, `dbMigrationComplete`) |
| `tls.cert` / `tls.key` | StartOS-managed TLS certificates                                                                                              |
| `lnd.conf`             | LND configuration (managed by StartOS actions)                                                                                |

If using the `bitcoind` backend, the Bitcoin `main` volume is mounted read-only at `/mnt/bitcoin` for cookie authentication.

## Installation and First-Run Flow

1. On install, StartOS creates two **critical tasks**:
   - **Select a Bitcoin backend** (local Bitcoin node or Neutrino)
   - **Initialize wallet** (start fresh, or migrate from Umbrel 1.x or another StartOS server)
2. TLS certificates are generated using StartOS's certificate system
3. The **Initialize Wallet** action generates a new wallet via the LND `/v1/genseed` and `/v1/initwallet` API. The 24-word Aezeed mnemonic is displayed **once** in the action result (the only time it is shown in the UI — write it down). Both the wallet password and the cipher seed are persisted to `store.json` (`walletPassword`, `aezeedCipherSeed`). The seed recovers on-chain funds only; recovering channel funds requires LND's Static Channel Backup, captured in StartOS backups
4. The wallet is **automatically unlocked** on every start via the `/v1/unlockwallet` API
5. If a Bitcoin backend is selected, StartOS creates a task on Bitcoin to **enable ZMQ**

Users never interact with `lncli create` or `lncli unlock` — StartOS handles both automatically.

## Configuration Management

LND is configured through **StartOS actions** (see [Actions](#actions-startos-ui) below); each configuration category has a dedicated action. Most actions write to `lnd.conf` on the `main` volume; the **Custom External Host** and **Watchtower Client** actions instead save their input to `store.json` and apply it at startup. You can also edit `lnd.conf` by hand — see [Editing `lnd.conf` directly](#editing-lndconf-directly) for what persists.

| StartOS-Managed (via Actions) | Details                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Bitcoin backend selection     | `bitcoind` or `neutrino`                                                                     |
| General settings              | Alias, color, keysend, AMP, debug level                                                      |
| Tor settings                  | Enable Tor (outbound proxy), optionally skip the proxy for clearnet peers                    |
| Custom external host          | Additional advertised public address — a tunnel/VPN endpoint such as Tunnelsats              |
| Routing fees                  | Base fee, fee rate, timelock delta                                                           |
| Channel settings              | Min/max size, wumbo, zero-conf, SCID alias, taproot/overlay, pending, circular route, closes |
| Autopilot                     | Enable/disable, max channels, allocation, channel size limits                                |
| Performance                   | invoice cleanup, reconnect stagger, graph pruning                                            |
| Watchtower server             | Enable/disable, listen address                                                               |
| Watchtower client             | Enable/disable, tower URIs                                                                   |

Settings **fixed** by StartOS (reset to these values, not user-configurable):

| Setting                             | Value                   | Reason                           |
| ----------------------------------- | ----------------------- | -------------------------------- |
| `bitcoin.mainnet`                   | `true`                  | Only mainnet supported           |
| `rpclisten`                         | `0.0.0.0:10009`         | Fixed gRPC listen address        |
| `restlisten`                        | `0.0.0.0:8080`          | Fixed REST listen address        |
| `listen`                            | `0.0.0.0:9735`          | Fixed peer listen address        |
| `rpcmiddleware.enable`              | `true`                  | Required for StartOS integration |
| `bitcoind.rpchost`                  | `10.0.3.1:8332`         | bitcoind RPC over the LXC bridge |
| `bitcoind.rpccookie`                | `/mnt/bitcoin/.cookie`  | Cookie auth via mounted volume   |
| `healthcheck.chainbackend.attempts` | `0`                     | Managed by StartOS health checks |
| `db.backend`                        | `sqlite`                | SQLite backend (replaces legacy bolt) |
| `db.use-native-sql`                 | `true`                  | Native SQL storage (invoices/graph/payments) |

### Default Overrides

Only settings that **diverge from upstream LND defaults** are written to `lnd.conf` on install. All other settings are left unset, allowing LND to use its built-in defaults. This keeps `lnd.conf` minimal and avoids drift when upstream defaults change between versions.

| Setting                               | Upstream Default   | Our Default              | Reason                                                                                                                      |
| ------------------------------------- | ------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `accept-keysend`                      | Disabled           | Enabled                  | Keysend is widely expected by wallets and apps that interact with LND nodes                                                 |
| `tor.active`                          | `false`            | `true` (enabled)         | Privacy-preserving default; "Enable Tor" defaults on, making Tor a required running dependency                              |
| `tor.skip-proxy-for-clearnet-targets` | `false` (tor-only) | `true` (clearnet direct) | Dials clearnet-reachable peers directly for performance (model default; existing nodes keep any explicit value). Turn off "Skip for clearnet peers" for tor-only |

### Database backend

LND runs on the **SQLite** backend with **native SQL** enabled. `db.backend=sqlite` and `db.use-native-sql=true` are **enforced** in `lnd.conf` (see the fixed-settings table above) — SQLite is Lightning Labs' recommended backend and removes the slow startup compaction the legacy `bolt` backend requires.

- **Fresh installs** are born on SQLite — the enforced keys are seeded on install, so **Initialize Wallet** creates the wallet directly in SQLite.
- **Existing `bolt` nodes** (upgrading from a pre-0.21 release) and **imports from Umbrel or a pre-0.21 StartOS** arrive as `bolt` data and are **converted on the first start**.
- **Imports from an already-migrated StartOS node** arrive as SQLite data (the tombstoned `bolt` files ride along) and are used as-is, detected by the presence of `channel.sqlite`.

**How the conversion runs.** The migration is an **init step** (`startos/init/migrateSqlite.ts`), so it runs — and must finish — before the service starts; the node is already on SQLite by the time `main` runs. It uses two temporary `runUntilSuccess` daemon chains: the first runs LND once on bolt as a managed daemon to bring the channeldb schema current (`lndinit migrate-db` only transfers buckets — it refuses a stale schema, and 0.21 adds a mandatory channeldb migration), unlocking the wallet to apply the migrations and then shutting LND down; the second, with LND stopped, runs `lndinit migrate-db` to copy every bucket into SQLite. If a `wtclient.db` is present, the finalize run also activates the watchtower client so LND brings that db to the latest schema too — `lndinit` likewise refuses an out-of-date `wtclient.db`, and older LND releases left an empty one behind even on nodes that never used the watchtower client. This is lossless: an empty db is simply initialized, and a db from prior watchtower use keeps its session data. The finalize run uses neutrino and overrides the enforced backend on the CLI (`--db.backend=bolt`) so it operates on the still-bolt data. While it runs, the service is **initializing** and reports its progress to the StartOS update UI as two named phases (_Finalizing database schema_ → _Copying database to SQLite_) via `setInitProgress`; on fresh installs (born on SQLite) and every start after the conversion, `needsSqliteMigration()` short-circuits and the step is a no-op.

**Safety.** The conversion is **one-way and irreversible — back up before updating.** It writes only `startup-flags.json` (never `store.json` or `lnd.conf`). It is resumable, and throws on failure so the init step retries until a run succeeds.

### Form Defaults and Footnotes

Configuration actions use a consistent pattern across number, text, and boolean fields:

- **`default: null`** — the field is empty (for numbers/text) or set to the middle "—" state (for tri-state booleans); if the user saves without changing the value, the key is omitted from `lnd.conf` and LND uses its upstream default
- **`footnote: "Default: <value>"`** — shows the upstream LND default persistently beneath the field, so the user knows what value applies when the field is left unset
- **`default: <value>`** — used only when we intentionally override the upstream default (e.g. `accept-keysend: true`); "reset defaults" restores our override, not the upstream value
- Optional booleans use `Value.triState` (true / false / null) rather than `Value.toggle` so the "null" middle state maps cleanly to "use the upstream default"

### Editing `lnd.conf` directly

You don't have to use the actions — you can edit `lnd.conf` by hand, and your changes are **preserved across restarts**. On each start StartOS merges your existing values rather than discarding them, so any setting it doesn't actively manage stays put. The exceptions, re-derived on every start, are:

- `externalip` / `externalhosts` — rebuilt by `watchHosts` from the Peer interface's addresses plus the **Custom External Host** action
- `tor.socks` — set by `watchTorSocks` to the Tor SOCKS proxy's LXC-bridge address (`10.0.3.1:9050`); always written (the bridge address is constant whether or not Tor is installed, so LND never restarts on Tor churn — LND only dials the proxy when Tor is enabled, and a dead address is just connection-refused)
- the Bitcoin backend keys (`bitcoin.node`, `bitcoind.rpchost`, `bitcoind.rpccookie`, `bitcoind.zmqpubrawblock`, `bitcoind.zmqpubrawtx`, `fee.url`) — re-applied by `main` from the selected backend

The fixed keys in the table above are likewise reset to their pinned values, `rpcuser`/`rpcpass` are stripped (cookie auth only), and **comments are not retained** — the file is rewritten from its parsed settings.

## Network Access and Interfaces

| Interface          | Port  | Protocol  | Purpose                            |
| ------------------ | ----- | --------- | ---------------------------------- |
| REST (LND Connect) | 8080  | HTTPS     | REST API, `lndconnect://` URIs     |
| gRPC (LND Connect) | 10009 | HTTPS     | gRPC API, `lndconnect://` URIs     |
| Peer               | 9735  | TCP (raw) | Lightning peer-to-peer connections |
| Watchtower         | 9911  | TCP (raw) | Watchtower server (when enabled)   |

The REST and gRPC interfaces export `lndconnect://` URIs with embedded macaroon credentials. The watchtower interface is only exposed when the watchtower server is enabled in configuration.

### External Address Advertisement

On every start, the `watchHosts` init rebuilds `externalip`/`externalhosts` for the Peer interface from these sources:

1. **Custom external host** — the domain set via the **Custom External Host** action; always added to `externalhosts`, independent of Tor mode
2. **Tor onion addresses** — every onion service on the Peer interface, added to `externalip`. This requires the **Tor** marketplace service (Tor is not built in) and an onion service added to the interface — there are none by default
3. **Public domains** — domains on the Peer interface, added to `externalhosts`, but only when "Skip for clearnet peers" is enabled (otherwise the node advertises onion-only)
4. **Public IPv4** — added to `externalip` as a fallback only when there is no custom host or public domain

`watchHosts` is the **sole writer** of `externalip`/`externalhosts`, so manual edits to _those two keys_ are re-derived on the next start — use the Custom External Host action instead. (Every other `lnd.conf` setting you edit by hand is preserved; see [Configuration Management](#configuration-management).)

## Actions (StartOS UI)

### Node Info

- **Name:** Node Info
- **Purpose:** Display node alias, pubkey, and peer URI(s)
- **Visibility:** Enabled
- **Availability:** Running only
- **Inputs:** None
- **Outputs:** Node alias (copyable), node ID (masked, copyable), node URI(s) (masked, copyable, QR)

### Watchtower Server Info

- **Name:** Watchtower Server Info
- **Purpose:** Display watchtower URI for sharing with peers
- **Visibility:** Conditional — disabled if watchtower server is not active
- **Availability:** Running only
- **Inputs:** None
- **Outputs:** Tower URI (masked, copyable, QR)

### General Settings

- **Name:** General Settings
- **Purpose:** Configure alias, color, keysend, AMP, debug level
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Alias (text, max 32 chars), color (hex), accept-keysend (tri-state, default: true), accept-amp (tri-state, default: null), debuglevel (select: trace / debug / info / `info,BTWL=error` / warn / error / critical, default: `info,BTWL=error` — Info with btcwallet warnings silenced)
- **Outputs:** None

### Tor Settings

- **Name:** Tor Settings
- **Purpose:** Enable/configure outbound Tor routing
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Enable Tor union (default: enabled); when enabled: skip for clearnet peers (toggle, default on — matches the install seed)
- **Outputs:** None

### Custom External Host

- **Name:** Custom External Host
- **Purpose:** Advertise an additional public address (e.g. a Tunnelsats or VPN tunnel endpoint) alongside Tor and StartOS-managed addresses
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Custom external host (text — a domain, optionally `domain:port`; optional). A literal IP is rejected; static IPs are advertised automatically via `externalip`
- **Outputs:** None
- **Notes:** Stored in `store.json` (`customExternalHosts`), not written to `lnd.conf` by the action — `watchHosts` merges it into `externalhosts`. Restart LND to advertise a newly added host.

### Routing Fees

- **Name:** Routing Fees
- **Purpose:** Configure default fees and timelock delta for forwarded payments
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Base fee (millisatoshi), fee rate (sats per million), timelock delta (blocks, min 18, max 2016)
- **Outputs:** None

### Channel Settings

- **Name:** Channel Settings
- **Purpose:** Configure channel acceptance policies including size limits, pending channel limits, and close behavior
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Default channel confirmations, min/max channel size, wumbo channels (tri-state), option-scid-alias (tri-state), zero-conf (tri-state), simple-taproot-chans (tri-state), simple-taproot-overlay-chans (tri-state), max pending channels, allow circular route (tri-state), reject push (tri-state), coop close target (blocks)
- **Outputs:** None

### Autopilot Settings

- **Name:** Autopilot Settings
- **Purpose:** Enable/configure automatic channel management
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Enable/disable union; when enabled: max channels, allocation (0–100%), min/max channel size, private (tri-state), min confirmations, confirmation target
- **Outputs:** None

### Bitcoin Backend

- **Name:** Bitcoin Backend
- **Purpose:** Select `bitcoind` or `neutrino` as the chain backend
- **Visibility:** Hidden (triggered as critical task on install)
- **Availability:** Any status
- **Inputs:** Select: bitcoind or neutrino
- **Outputs:** None

### Performance

- **Name:** Performance
- **Purpose:** Invoice cleanup and network efficiency settings
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** GC canceled invoices on startup (tri-state), GC canceled invoices live (tri-state), stagger initial reconnect (tri-state), ignore historical gossip (tri-state), strict graph pruning (tri-state)
- **Outputs:** None

### Watchtower Server

- **Name:** Watchtower Server
- **Purpose:** Enable/configure the watchtower server and select the external address to advertise
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** External IP selection (from available watchtower interface public addresses, or "none" to disable)
- **Outputs:** None

### Watchtower Client Settings

- **Name:** Watchtower Client Settings
- **Purpose:** Enable/configure watchtower client and add tower URIs
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Enable/disable union; when enabled: list of watchtower URIs (`pubkey@host:9911`)
- **Outputs:** None

### Initialize Wallet

- **Name:** Initialize Wallet
- **Purpose:** Create a new wallet or migrate from Umbrel 1.x / another StartOS server
- **Visibility:** Hidden (triggered as critical task on install)
- **Availability:** Stopped only
- **Inputs:** Select variant: "Start Fresh" (no inputs), "Migrate from Umbrel" (host + password), or "Migrate from StartOS" (host + master password)
- **Outputs:** For fresh: 24-word Aezeed mnemonic (masked, copyable — shown once in the UI; the seed is persisted in `store.json` as `aezeedCipherSeed`). For migration: success/failure message

### Reset Wallet Transactions

- **Name:** Reset Wallet Transactions
- **Purpose:** Rescan on-chain transactions from wallet birthday; useful for picking up missed transactions
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** None
- **Outputs:** None (restarts LND with `--reset-wallet-transactions`)

### Recreate Macaroons

- **Name:** Recreate Macaroons
- **Purpose:** Delete and regenerate all macaroon files
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** None
- **Outputs:** None
- **Warning:** May require restarting dependent services

### Auto-Configure

- **Name:** Auto-Configure
- **Purpose:** Let a dependent service request specific `lnd.conf` settings through a one-click task, instead of asking the user to SSH in and edit the file by hand
- **Visibility:** Hidden — never listed in the actions menu; only surfaced as a task posted by a dependent service
- **Availability:** Any status
- **Inputs:** The requesting service supplies a partial set of config fields; the user sees only those fields, pre-filled and locked, and approves. Currently the form can expose **Enable Onion Messages (BOLT12)**, which writes `protocol.custom-message=513`, `protocol.custom-nodeann=39`, and `protocol.custom-init=39` to `lnd.conf` to enable onion-message support for BOLT12 offers (requested by services such as BOLT12 Pay / LNDK)
- **Outputs:** None

## Backups and Restore

**Backed up:** The entire `main` volume, **excluding** files that are rebuilt automatically: `data/graph`, `data/chain/bitcoin/mainnet/channel.db`, `data/chain/bitcoin/mainnet/sphinxreplay.db`, `data/chain/bitcoin/mainnet/neutrino.db`, `data/chain/bitcoin/mainnet/block_headers.bin`, `data/chain/bitcoin/mainnet/reg_filter_headers.bin`, and `logs`.

**Restore behavior:** After restore, LND automatically runs `restorechanbackup` to request force-close of all channels from the Static Channel Backup. A persistent health check warning is displayed advising the user to sweep funds and reinstall LND fresh.

**Important:** Lightning Labs strongly recommends against continued use of a restored LND node. After recovery, sweep all on-chain funds to another wallet, uninstall LND, then reinstall fresh.

## Health Checks

| Check                      | Method                                                              | Grace Period | Messages                                                  |
| -------------------------- | ------------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| **LND Server**             | HTTPS `GET /v1/state` on port 8080 using the self-signed `tls.cert` | Default      | Success: "LND is ready" / Starting: (no message, waiting) |
| **Network and Graph Sync** | `lncli getinfo` (synced_to_chain + synced_to_graph)                 | Default      | Synced / Syncing to chain / Syncing to graph / Starting   |
| **Node Reachability**      | Config check (conditional)                                          | N/A          | Disabled message if no external IP or hostname configured |
| **Backup Restoration**     | Conditional (after restore)                                         | N/A          | Warning to sweep funds and reinstall                      |

The LND Server check calls the REST `/v1/state` endpoint and returns `success` once the server replies with any valid state JSON. It is a stronger readiness signal than a bare port-listening check — the port binds before LND is actually ready to serve RPCs — so dependent services (like Mempool) that gate on this health check will wait until LND can answer API calls.

When LND first reaches `synced_to_chain && synced_to_graph` after install, a **Sync Complete** notification is posted to the StartOS notifications panel. The notification fires only once per install — subsequent restarts that re-sync the chain or graph do not re-notify.

## Dependencies

| Dependency   | Required | Mounted Volume                      | Health Checks Required      | Purpose                                                        |
| ------------ | -------- | ----------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Bitcoin      | Optional | `main` → `/mnt/bitcoin` (read-only) | `sync-progress`, `bitcoind` | Block data, transaction broadcasting via ZMQ + RPC cookie auth |
| Tor          | Optional | None                                | `tor`                       | Required (running) when "Enable Tor" is on (Tor Settings)      |

When using Bitcoin as backend, LND requires the listed health checks to pass on Bitcoin before starting. LND uses cookie authentication via the mounted `.cookie` file.

LND can alternatively use **Neutrino** (built-in light client) with no Bitcoin dependency.

Tor is likewise a marketplace service, not built into StartOS. It provides LND's outbound SOCKS proxy and the onion services used for inbound reachability, and becomes a required _running_ dependency whenever **Enable Tor** is on.

## Limitations and Differences

1. **Mainnet only** — testnet/regtest/signet are not available
2. **No `lncli create` or `lncli unlock`** — wallet lifecycle is fully automated by StartOS
3. **A few `lnd.conf` keys are StartOS-managed** — `externalip`/`externalhosts`, `tor.socks`, and the Bitcoin backend connection keys are re-derived on every start, so hand-edits to _those_ keys don't stick (use the corresponding action). Every other setting you put in `lnd.conf` is preserved across restarts — see [Editing `lnd.conf` directly](#editing-lndconf-directly)
4. **Bitcoin cookie auth only** — `rpcuser`/`rpcpass` are explicitly removed; authentication uses the mounted `.cookie` file
5. **"Enable Tor" affects outbound only** — Tor is not built into StartOS; it is a marketplace service. The Tor Settings toggle controls whether LND's _outbound_ peer dials use the Tor proxy. It does not create inbound reachability: that comes from adding an onion service to the Peer interface (via the Tor service), and once added it works independently of this toggle. Without the Tor service installed, neither outbound nor inbound Tor is available.
6. **Restored nodes should not be reused** — after backup restore, sweep funds and reinstall

## What Is Unchanged from Upstream

- Channel management (open, close, force-close, cooperative close)
- Payment sending and receiving (including keysend and AMP when enabled)
- Invoice creation and management
- On-chain wallet functionality
- Routing and forwarding
- Watchtower protocol (both server and client)
- Autopilot behavior
- All gRPC and REST API endpoints
- `lncli` command set (accessible via actions or container exec)
- BOLT specification compliance

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for build instructions and development workflow.

---

## Quick Reference for AI Consumers

```yaml
package_id: lnd
upstream_version: see manifest dockerTag
image: built from ./Dockerfile (lightninglabs/lnd + lndinit binary)
architectures: [x86_64, aarch64]
volumes:
  main: /root/.lnd
ports:
  control: 8080
  grpc: 10009
  peer: 9735
  watchtower: 9911
dependencies:
  - bitcoind (optional)
  - tor (optional)
startos_managed_env_vars: []
startos_managed_files:
  - lnd.conf
  - store.json
  - startup-flags.json
  - tls.cert
  - tls.key
actions:
  - general
  - routing-fees-config
  - channels-config
  - autopilot-config
  - tor-config
  - custom-external-host-config
  - backend-config
  - performance-config
  - watchtower-server-config
  - watchtower-client-config
  - node-info
  - tower-info
  - initialize-wallet
  - reset-wallet-transactions
  - recreate-macaroons
  - autoconfig (hidden; dependent-driven, e.g. onion messages for BOLT12)
health_checks:
  - lnd_state: https GET /v1/state on 8080 (self-signed cert from tls.cert)
  - lncli_getinfo: synced_to_chain, synced_to_graph
  - reachability: conditional (no external address advertised)
  - restored: conditional (set after backup restore)
  - db_migration: conditional (only on a first start that converts bolt → sqlite)
backup_volumes:
  - main (excluding data/graph, channel.db, sphinxreplay.db, neutrino.db, block_headers.bin, reg_filter_headers.bin, logs)
```
