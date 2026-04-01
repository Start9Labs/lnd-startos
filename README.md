<p align="center">
  <img src="icon.svg" alt="LND Logo" width="21%">
</p>

# LND on StartOS

> **Upstream docs:** <https://docs.lightning.engineering/>
>
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

| Property      | Value                                    |
| ------------- | ---------------------------------------- |
| Image         | `lightninglabs/lnd` (upstream, unmodified) |
| Architectures | x86_64, aarch64                          |
| Entrypoint    | `lnd` (default upstream)                 |

## Volume and Data Layout

| Volume | Mount Point  | Purpose                                     |
| ------ | ------------ | ------------------------------------------- |
| `main` | `/root/.lnd` | All LND data (wallet, channels, DB, config) |

StartOS-specific files on the `main` volume:

| File                   | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `store.json`           | Persistent StartOS state (wallet password, restore flag, watchtower clients) |
| `tls.cert` / `tls.key` | StartOS-managed TLS certificates                                            |
| `lnd.conf`             | LND configuration (managed by StartOS actions)                               |

If using the `bitcoind` backend, the Bitcoin Core `main` volume is mounted read-only at `/mnt/bitcoin` for cookie authentication.

## Installation and First-Run Flow

1. On install, StartOS creates two **critical tasks**:
   - **Select a Bitcoin backend** (local Bitcoin Core or Neutrino)
   - **Initialize wallet** (start fresh, or migrate from Umbrel 1.x or another StartOS server)
2. TLS certificates are generated using StartOS's certificate system
3. The **Initialize Wallet** action generates a new wallet via the LND `/v1/genseed` and `/v1/initwallet` API. The 24-word Aezeed mnemonic is displayed **once** in the action result — it is **not stored**. The wallet password is saved to `store.json`
4. The wallet is **automatically unlocked** on every start via the `/v1/unlockwallet` API
5. If a Bitcoin Core backend is selected, StartOS creates a task on Bitcoin Core to **enable ZMQ**

Users never interact with `lncli create` or `lncli unlock` — StartOS handles both automatically.

## Configuration Management

LND is configured entirely through **StartOS actions** (see [Actions](#actions-startos-ui) below). Each configuration category has a dedicated action that writes to the `lnd.conf` file on the `main` volume.

| StartOS-Managed (via Actions) | Details                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| Bitcoin backend selection     | `bitcoind` or `neutrino`                                               |
| General settings              | Alias, color, keysend, AMP, tor-only mode                             |
| Routing fees                  | Base fee, fee rate, timelock delta                                     |
| Channel settings              | Min/max size, wumbo, zero-conf, SCID alias, pending, circular route, closes |
| Autopilot                     | Enable/disable, max channels, allocation, channel size limits          |
| Performance                   | DB auto-compact, invoice cleanup, reconnect stagger, graph pruning     |
| Watchtower server             | Enable/disable, listen address                                         |
| Watchtower client             | Enable/disable, tower URIs                                             |

Settings **not** managed by StartOS (hardcoded):

| Setting                             | Value                   | Reason                           |
| ----------------------------------- | ----------------------- | -------------------------------- |
| `bitcoin.mainnet`                   | `true`                  | Only mainnet supported           |
| `tor.active`                        | `true`                  | Always routed through Tor        |
| `rpclisten`                         | `0.0.0.0:10009`         | Fixed gRPC listen address        |
| `restlisten`                        | `0.0.0.0:8080`          | Fixed REST listen address        |
| `listen`                            | `0.0.0.0:9735`          | Fixed peer listen address        |
| `rpcmiddleware.enable`              | `true`                  | Required for StartOS integration |
| `bitcoind.rpchost`                  | `bitcoind.startos:8332` | StartOS service networking       |
| `bitcoind.rpccookie`                | `/mnt/bitcoin/.cookie`  | Cookie auth via mounted volume   |
| `healthcheck.chainbackend.attempts` | `0`                     | Managed by StartOS health checks |

### Default Overrides

Only settings that **diverge from upstream LND defaults** are written to `lnd.conf` on install. All other settings are left unset, allowing LND to use its built-in defaults. This keeps `lnd.conf` minimal and avoids drift when upstream defaults change between versions.

| Setting                               | Upstream Default   | Our Default             | Reason                                                                                   |
| ------------------------------------- | ------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `accept-keysend`                      | Disabled           | Enabled                 | Keysend is widely expected by wallets and apps that interact with LND nodes              |
| `tor.skip-proxy-for-clearnet-targets` | `false` (tor-only) | `true` (allow clearnet) | Better performance by default; users can opt into tor-only via "Use Tor for all traffic" |

### Form Defaults vs Placeholders

Configuration actions use a consistent pattern for number and text fields:

- **`default: null`** — the field is empty; if the user saves without setting a value, the key is omitted from `lnd.conf` and LND uses its upstream default
- **`placeholder`** — shows the upstream LND default, so the user knows what value applies when the field is left empty
- **`default: <value>`** — used only when we intentionally override the upstream default (e.g. `accept-keysend: true`); "reset defaults" restores our override, not the upstream value

## Network Access and Interfaces

| Interface          | Port  | Protocol  | Purpose                            |
| ------------------ | ----- | --------- | ---------------------------------- |
| REST (LND Connect) | 8080  | HTTPS     | REST API, `lndconnect://` URIs     |
| gRPC (LND Connect) | 10009 | HTTPS     | gRPC API, `lndconnect://` URIs     |
| Peer               | 9735  | TCP (raw) | Lightning peer-to-peer connections |
| Watchtower         | 9911  | TCP (raw) | Watchtower server (when enabled)   |

The REST and gRPC interfaces export `lndconnect://` URIs with embedded macaroon credentials. The watchtower interface is only exposed when the watchtower server is enabled in configuration.

### External Address Advertisement

StartOS automatically manages how LND advertises itself to the Lightning Network. Addresses are resolved in the following priority order:

1. **Tor onion addresses** — always added to `externalip`
2. **Public domains** — if not using tor-only mode, added to `externalhosts`
3. **IPv4 addresses** — used as a fallback in `externalip` only when no public domains are available

This means LND can advertise via domain names (not just raw IPs) when the node has a public domain configured in StartOS.

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
- **Purpose:** Configure alias, color, keysend, AMP, tor-only mode
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Alias (text, max 32 chars), color (hex), accept-keysend (toggle, default: true), accept-amp (toggle, default: false), use-tor-only (toggle, default: false)
- **Outputs:** None

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
- **Inputs:** Default channel confirmations, min/max channel size, wumbo channels (toggle), option-scid-alias (toggle), zero-conf (toggle), max pending channels, allow circular route (toggle), reject push (toggle), coop close target (blocks)
- **Outputs:** None

### Autopilot Settings

- **Name:** Autopilot Settings
- **Purpose:** Enable/configure automatic channel management
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Enable/disable union; when enabled: max channels, allocation (0–100%), min/max channel size, private (toggle), min confirmations, confirmation target
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
- **Purpose:** Database compaction, invoice cleanup, and network efficiency settings
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** Auto-compact (toggle), GC canceled invoices on startup (toggle), GC canceled invoices live (toggle), stagger initial reconnect (toggle), ignore historical gossip (toggle), strict graph pruning (toggle)
- **Outputs:** None

### Watchtower Server

- **Name:** Watchtower Server
- **Purpose:** Enable/configure the watchtower server and select the external address to advertise
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** External IP selection (from available peer interface public addresses, or "none" to disable)
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
- **Outputs:** For fresh: 24-word Aezeed mnemonic (masked, copyable — shown once, not stored). For migration: success/failure message

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

## Backups and Restore

**Backed up:** The entire `main` volume, **excluding** files that are rebuilt automatically: `data/graph`, `data/chain/bitcoin/mainnet/channel.db`, `data/chain/bitcoin/mainnet/sphinxreplay.db`, `data/chain/bitcoin/mainnet/neutrino.db`, `data/chain/bitcoin/mainnet/block_headers.bin`, `data/chain/bitcoin/mainnet/reg_filter_headers.bin`, and `logs`.

**Restore behavior:** After restore, LND automatically runs `restorechanbackup` to request force-close of all channels from the Static Channel Backup. A persistent health check warning is displayed advising the user to sweep funds and reinstall LND fresh.

**Important:** Lightning Labs strongly recommends against continued use of a restored LND node. After recovery, sweep all on-chain funds to another wallet, uninstall LND, then reinstall fresh.

## Health Checks

| Check                      | Method                                              | Grace Period | Messages                                                   |
| -------------------------- | --------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| **REST Interface**         | Port listening (8080)                               | Default      | Success: "The REST interface is ready to accept connections" / Error: "The REST Interface is not ready" |
| **Network and Graph Sync** | `lncli getinfo` (synced_to_chain + synced_to_graph) | Default      | Synced / Syncing to chain / Syncing to graph / Starting    |
| **Node Reachability**      | Config check (conditional)                          | N/A          | Disabled message if no external IP or hostname configured  |
| **Backup Restoration**     | Conditional (after restore)                         | N/A          | Warning to sweep funds and reinstall                       |

## Dependencies

| Dependency   | Required | Mounted Volume                          | Health Checks Required         | Purpose                                                        |
| ------------ | -------- | --------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Bitcoin Core | Optional | `main` → `/mnt/bitcoin` (read-only)    | `sync-progress`, `bitcoind`    | Block data, transaction broadcasting via ZMQ + RPC cookie auth |
| Tor          | Optional | None                                    | None                           | Required when "Use Tor for all traffic" is enabled             |

When using Bitcoin Core as backend, LND requires the listed health checks to pass on Bitcoin Core before starting. LND uses cookie authentication via the mounted `.cookie` file.

LND can alternatively use **Neutrino** (built-in light client) with no Bitcoin Core dependency.

## Limitations and Differences

1. **Mainnet only** — testnet/regtest/signet are not available
2. **No `lncli create` or `lncli unlock`** — wallet lifecycle is fully automated by StartOS
3. **Configuration via actions only** — `lnd.conf` is managed by StartOS; manual edits will be overwritten by action defaults on mismatch
4. **Bitcoin Core cookie auth only** — `rpcuser`/`rpcpass` are explicitly removed; authentication uses the mounted `.cookie` file
5. **Tor is always active** — `tor.active=true` is hardcoded; clearnet-only operation is not supported
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
image: lightninglabs/lnd
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
  - tls.cert
  - tls.key
actions:
  - general
  - routing-fees-config
  - channels-config
  - autopilot-config
  - backend-config
  - performance-config
  - watchtower-server-config
  - watchtower-client-config
  - node-info
  - tower-info
  - initialize-wallet
  - reset-wallet-transactions
  - recreate-macaroons
health_checks:
  - port_listening: 8080
  - lncli_getinfo: synced_to_chain, synced_to_graph
  - reachability: conditional
backup_volumes:
  - main (excluding data/graph, channel.db, sphinxreplay.db, neutrino.db, block_headers.bin, reg_filter_headers.bin, logs)
```
