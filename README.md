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

| Property      | Value                                                                 |
| ------------- | --------------------------------------------------------------------- |
| Image         | Built from `./Dockerfile`: `lightninglabs/lnd` + the `lndinit` binary |
| Architectures | x86_64, aarch64                                                       |
| Entrypoint    | `lnd` (default upstream)                                              |

`lndinit` is added solely for the offline bolt → SQLite database conversion (see [Database backend](#database-backend)); the `lnd` binary and runtime are otherwise the upstream image. The Dockerfile also restores `curl` (dropped when the upstream image moved to Alpine) and adds `sqlite`, `openssh-client`, and `sshpass` — see [Initialize Wallet](#initialize-wallet) for what the SSH pair is for.

## Volume and Data Layout

| Volume | Mount Point  | Purpose                                     |
| ------ | ------------ | ------------------------------------------- |
| `main` | `/root/.lnd` | All LND data (wallet, channels, DB, config) |

StartOS-specific files on the `main` volume:

| File                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store.json`           | Persistent StartOS state: wallet password, Aezeed cipher seed, restore/reset flags, watchtower clients, custom external hosts                                                                                                                                                                                                                                                                         |
| `startup-flags.json`   | Per-run flags, none of which restart the service when written: reset-wallet-transactions, restore, `rotateMacaroonRootKey`, the **Sync Complete** notified flag, bolt→SQLite migration progress (`dbSchemaFinalized`, `dbMigrationComplete`), and `importPending` — a migration scheduled by **Initialize Wallet**, holding the origin's address and password (see [Startup phases](#startup-phases)) |
| `tls.cert` / `tls.key` | StartOS-managed TLS certificates                                                                                                                                                                                                                                                                                                                                                                      |
| `lnd.conf`             | LND configuration (managed by StartOS actions)                                                                                                                                                                                                                                                                                                                                                        |

If using the `bitcoind` backend, the Bitcoin `main` volume is mounted read-only at `/mnt/bitcoin` for cookie authentication.

## Installation and First-Run Flow

1. On install, StartOS creates two **critical tasks**:
   - **Select a Bitcoin backend** (local Bitcoin node or Neutrino)
   - **Initialize wallet** (start fresh, or migrate from Umbrel 1.x, myNode, or another StartOS server)
2. TLS certificates are generated using StartOS's certificate system
3. The **Initialize Wallet** action generates a new wallet via the LND `/v1/genseed` and `/v1/initwallet` API. The 24-word Aezeed mnemonic is displayed **once** in the action result (the only time it is shown in the UI — write it down). Both the wallet password and the cipher seed are persisted to `store.json` (`walletPassword`, `aezeedCipherSeed`). The seed recovers on-chain funds only; recovering channel funds requires LND's Static Channel Backup, captured in StartOS backups
4. The wallet is **automatically unlocked** on every start via the `/v1/unlockwallet` API
5. If a Bitcoin backend is selected, StartOS creates a task on Bitcoin to **enable ZMQ**

Users never interact with `lncli create` or `lncli unlock` — StartOS handles both automatically.

### Startup phases

`main` does not return one fixed daemon chain. It returns a `Daemons.dynamic` reconciler that picks one of three chains from the state on disk, and swaps to the next one as that state changes:

| Phase           | Runs when                                      | What it does                                                                                                             |
| --------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `import`        | `importPending` is set in `startup-flags.json` | Runs the origin's import script (stop the origin, copy its data, adopt its wallet password), then clears `importPending` |
| `db-conversion` | `needsSqliteMigration()` is true               | Runs the bolt → SQLite conversion, which sets `dbMigrationComplete`                                                      |
| LND             | neither of the above                           | The real chain: the `lnd` daemon, wallet unlock, sync/reachability health checks, watchtowers                            |

The order is load-bearing — LND must never open an un-imported or un-converted data directory — and each preparatory phase ends by writing the flag that selects the next one. The reconciler watches `importPending` and `dbMigrationComplete` with `.const()` on its own child effects, so a phase completing swaps the chain **without restarting main**; the outer `store.json` / `lnd.conf` watches keep their usual restart-main semantics.

Both preparatory phases have to be phases rather than work done up front. An action is capped at 120 seconds by StartOS, so a copy or a conversion measured in hours cannot run there; and awaiting it inside `setupMain` instead would hold the service at _starting_, with no health checks of its own and no logs to watch. As phases, the chain is built immediately and the service reaches **started**, each phase reporting progress through a health check (`import`, `db-migration`) with a `loading` result — so the badge reads _Running_ while the work is in flight, and **Stop** tears the work down instead of finding the service wedged in _starting_. The import copy is given the phase's abort signal, so a stop kills the transfer rather than waiting it out.

Because a failed oneshot is retried by the SDK (with a backoff up to 30 s) and a oneshot's own health is internal to the chain — StartOS shows nothing for it — each phase writes its own health entry on every exit path: `loading` while working, `success` when done, `failure` with the error otherwise. A failure therefore stays visible on the service page, and the retry flips the same entry back to `loading` when it starts over.

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

| Setting                             | Value                  | Reason                                       |
| ----------------------------------- | ---------------------- | -------------------------------------------- |
| `bitcoin.mainnet`                   | `true`                 | Only mainnet supported                       |
| `rpclisten`                         | `0.0.0.0:10009`        | Fixed gRPC listen address                    |
| `restlisten`                        | `0.0.0.0:8080`         | Fixed REST listen address                    |
| `listen`                            | `0.0.0.0:9735`         | Fixed peer listen address                    |
| `rpcmiddleware.enable`              | `true`                 | Required for StartOS integration             |
| `bitcoind.rpchost`                  | `10.0.3.1:8332`        | bitcoind RPC over the LXC bridge             |
| `bitcoind.rpccookie`                | `/mnt/bitcoin/.cookie` | Cookie auth via mounted volume               |
| `healthcheck.chainbackend.attempts` | `0`                    | Managed by StartOS health checks             |
| `db.backend`                        | `sqlite`               | SQLite backend (replaces legacy bolt)        |
| `db.use-native-sql`                 | `true`                 | Native SQL storage (invoices/graph/payments) |

### Default Overrides

Only settings that **diverge from upstream LND defaults** are written to `lnd.conf` on install. All other settings are left unset, allowing LND to use its built-in defaults. This keeps `lnd.conf` minimal and avoids drift when upstream defaults change between versions.

| Setting                               | Upstream Default   | Our Default              | Reason                                                                                                                                                           |
| ------------------------------------- | ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accept-keysend`                      | Disabled           | Enabled                  | Keysend is widely expected by wallets and apps that interact with LND nodes                                                                                      |
| `tor.active`                          | `false`            | `true` (enabled)         | Privacy-preserving default; "Enable Tor" defaults on, making Tor a required running dependency                                                                   |
| `tor.skip-proxy-for-clearnet-targets` | `false` (tor-only) | `true` (clearnet direct) | Dials clearnet-reachable peers directly for performance (model default; existing nodes keep any explicit value). Turn off "Skip for clearnet peers" for tor-only |

### Database backend

LND runs on the **SQLite** backend with **native SQL** enabled. `db.backend=sqlite` and `db.use-native-sql=true` are **enforced** in `lnd.conf` (see the fixed-settings table above) — SQLite is Lightning Labs' recommended backend and removes the slow startup compaction the legacy `bolt` backend requires.

- **Fresh installs** are born on SQLite — the enforced keys are seeded on install, so **Initialize Wallet** creates the wallet directly in SQLite.
- **Existing `bolt` nodes** (upgrading from a pre-0.21 release) and **imports from Umbrel, myNode, or a pre-0.21 StartOS** arrive as `bolt` data and are **converted on the first start**.
- **Imports from an already-migrated StartOS node** arrive as SQLite data (the tombstoned `bolt` files ride along) and are used as-is, detected by the presence of `channel.sqlite`.

**How the conversion runs.** The work lives in `startos/sqliteBackend.ts` and always finishes before LND itself starts. It uses two temporary `runUntilSuccess` daemon chains: the first runs LND once on bolt as a managed daemon to bring the channeldb schema current (`lndinit migrate-db` only transfers buckets — it refuses a stale schema, and 0.21 adds a mandatory channeldb migration), unlocking the wallet to apply the migrations and then shutting LND down; the second, with LND stopped, runs `lndinit migrate-db` to copy every bucket into SQLite. If a `wtclient.db` is present, the finalize run also activates the watchtower client so LND brings that db to the latest schema too — `lndinit` likewise refuses an out-of-date `wtclient.db`, and older LND releases left an empty one behind even on nodes that never used the watchtower client. This is lossless: an empty db is simply initialized, and a db from prior watchtower use keeps its session data. The finalize run starts LND with no chain backend (`--bitcoin.node=nochainbackend`), so it reaches neither bitcoind nor a neutrino store and needs no fee source, and overrides the enforced backend on the CLI (`--db.backend=bolt`) so it operates on the still-bolt data.

**Two callers: updates convert in init, everything else in main.**

- **An update** brings bolt data in before the service can start, so the conversion runs as the **current version's migration** (`startos/versions/current.ts`, `migrations.up`) — reporting two named phases (_Finalizing database schema_ → _Copying database to SQLite_) to the update progress UI the updating user is already watching. A migration runs on updates only by construction, which is the point: init also fires on server boot and container rebuild — awaited with no timeout, four packages at a time — so a conversion there would stall the whole server coming up.
- **Every other arrival or resume** — an Initialize Wallet import, a conversion interrupted and resumed across a boot or container rebuild, a restored pre-conversion backup — is handled by **main's conversion phase** (`migrateOnStart`, see [Startup phases](#startup-phases)), reporting the same two phases through the `db-migration` health check after a fast boot.

Both callers gate on the same `needsSqliteMigration()`, which short-circuits on fresh installs (born on SQLite) and on every start after a conversion, so on the normal path each is a couple of stat calls. Besides the bolt `channel.db` check, the gate also triggers on a bolt `wallet.db` with no `chain.sqlite` beside it (on the SQLite backend the wallet and macaroons live in `chain.sqlite`; there is no `wallet.sqlite`): backups exclude `data/graph` entirely, so a backup taken before a conversion completed restores a bolt wallet with no channel db of either kind — without this branch such a restore would come up on the enforced SQLite backend with no wallet at all. (Restores can encounter this state at the current version because backups embed the s9pk that made them, so only a backup of an unconverted _current-version_ node — imported but not yet converted — hits it; a bolt-era backup restores the bolt-era package.) `startup-flags.json` is excluded from backups entirely (see [Backups](#backups-and-restore)), and a restore additionally clears any `importPending` (`startos/backups.ts`) as a belt against backups made by earlier builds: its origin credentials would be stale, and restore recovery goes through the SCB flow, not a re-copy.

**Safety.** The conversion is **one-way and irreversible — back up before updating.** It writes only `startup-flags.json` (never `store.json` or `lnd.conf`). It is resumable, and throws on failure so the caller retries until a run succeeds.

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
- `tor.dns` — set by `watchTorDns` to the OS resolver (`10.0.3.1:53`); written like `tor.socks` in every mode except tor-only, where it is cleared. See [DNS-seed bootstrapping under Tor](#dns-seed-bootstrapping-under-tor)
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

### TLS on REST and gRPC

The two interfaces are terminated differently, and the asymmetry is deliberate.

**REST** binds with `protocol: 'https'` plus an `addSsl` block, so StartOS terminates the client's TLS at its reverse proxy — serving the device certificate the client already trusts (Root CA, or ACME where a domain is configured) — then opens a second TLS connection to the container, validating what LND serves against the StartOS root CA. `protocol: 'https'` on its own does not do this; the `addSsl` block is what puts the proxy in front.

**gRPC** is passed through instead (`protocol`/`addSsl` null, `secure.ssl`), so LND terminates its own TLS and the client pins that certificate from the `lndconnect://` URI. It cannot use the REST arrangement: no ALPN is negotiated with the client across an `addSsl` rewrap, and gRPC-go rejects a connection without a selected ALPN (`missing selected ALPN property`). Measured from inside the container with gRPC temporarily bound behind `addSsl`: `127.0.0.1:10009` negotiated h2 while `10.0.3.1:10009` failed the handshake outright, where REST's `10.0.3.1:8080` returned 200 over HTTP/1.1, which needs no ALPN. As shipped — gRPC on passthrough — `10.0.3.1:10009` serves gRPC normally.

Consequences worth knowing:

- **Only the gRPC URI carries a certificate.** REST clients validate against the device certificate, so embedding LND's would pin the wrong one — and it inflated the REST QR past what the UI can encode. gRPC has no such option: pinning is the only way a client can verify LND's own certificate, so its QR stays dense.
- **Both bindings' bridge ports live in `net.assignedSslPort`, not `net.assignedPort`.** Which field holds the port says whether the port speaks TLS, not who terminates it: `assignedSslPort` covers `addSsl` and passthrough alike, `assignedPort` only a plaintext port, and a binding never populates both unless it publishes both legs (`preferred_ssl_port` / `wants_plain_port` in `net/host/binding.rs`). So REST and gRPC each carry an `assignedSslPort` and a null `assignedPort`. Dependents still reach REST at `10.0.3.1:8080` — that is the reverse proxy — and their mounted `tls.cert` still validates it, because that file is a fullchain whose last entry is the StartOS root CA and the proxy's bridge certificate chains to the same root. What breaks is only the lookup: a dependent reading `net.assignedPort` directly resolves null. `sdk.host.getBridgeAddress` reads the binding's derived address instead and is correct either way, which is what every dependent now uses.
- **LND's own calls go over loopback.** `selfRestUrl` / `selfGrpcHost` (`startos/utils.ts`) are plain `127.0.0.1` constants. Subcontainers do not unshare the network namespace, so loopback reaches the `lnd` daemon directly; REST's bridge address is the proxy, which answers with the device certificate and would fail the `tls.cert` pin the health checks, wallet unlock and `lncli` use.
- **`tls.cert` SANs are load-bearing** (`startos/init/setupCerts.ts`): the container IP for the proxy's inbound REST leg, `127.0.0.1` for LND's self-calls, and `10.0.3.1` for dependents dialing gRPC, whose TLS StartOS pipes through to LND rather than terminating, so the client validates LND's own certificate against the address it dialed. The container IP is read with `.const()`, so a new container IP reissues the certificate rather than silently breaking the proxy leg.

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
- **Purpose:** Create a new wallet or migrate from Umbrel 1.x / myNode / another StartOS server
- **Visibility:** Hidden (triggered as critical task on install)
- **Availability:** Stopped only
- **Inputs:** Select variant: "Start Fresh" (no inputs), "Migrate from Umbrel" (host + password), "Migrate from myNode" (host + `admin` password), or "Migrate from StartOS" (host + master password)
- **Outputs:** For fresh: 24-word Aezeed mnemonic (masked, copyable — shown once in the UI; the seed is persisted in `store.json` as `aezeedCipherSeed`). For migration: confirmation that the origin was reached and the migration is scheduled, or — since a failed preflight throws rather than returning — an action error, which leaves the critical task pending so it can be retried

**How a migration works.** The action **schedules** the migration; `main` runs it. StartOS caps an action run at 120 seconds, while handing over a routing node's channel database takes minutes to hours, so the action does only the part that has to be interactive: it opens an SSH session to the origin (`sshpass … ssh -o ConnectTimeout=10 … true`, in a temp subcontainer with no mounts, capped at 30 s) and tells the user immediately whether the address and password work. That login is the whole preflight, because every import script authenticates with exactly those credentials — myNode and StartOS feed the same password to `sudo -S` as well. On success it records `importPending: { source, host, password }` in `startup-flags.json`; nothing on the origin has been touched. Choosing **Start Fresh** clears any scheduled import first, so a migration the user thought better of cannot run over the new wallet.

The copy itself is the `import` phase of main's daemon chain (see [Startup phases](#startup-phases)), so it begins when the user starts LND — that, not running the action, is when the origin node is stopped. Each origin platform gets a script in `assets/`, run in the phase's subcontainer with the `main` volume mounted at `/root/.lnd` and `assets/` at `/scripts`, with a 6-hour exec cap rather than the SDK's 30-second default because a busy routing node's channel database is measured in gigabytes. Every script does the same three things: stop LND (and its neighbours) on the origin over SSH, stream its LND data directory into the volume, and leave the origin's wallet password at `/tmp/old-store.json`, which the phase parses and merges into `store.json` — LND then unlocks the imported wallet with the password it was created under. Progress and failures are reported through the **Wallet Import** health check.

The password is adopted **before** `importPending` is cleared. An interruption between the two only repeats the import; the reverse order could leave imported data behind with no password that opens it, which is exactly what the conversion phase then fails on. Writing `store.json` trips main's `.const` watch and restarts main, but the SDK's teardown awaits the running oneshot rather than killing it, so the flag clear lands too and the restarted main opens on the conversion phase.

| Origin  | Script                     | SSH user | Source path                                      | Wallet password                   |
| ------- | -------------------------- | -------- | ------------------------------------------------ | --------------------------------- |
| Umbrel  | `assets/import-umbrel.sh`  | `umbrel` | `~/umbrel/app-data/lightning/data/lnd/data`      | Fixed upstream constant           |
| myNode  | `assets/import-mynode.sh`  | `admin`  | `/mnt/hdd/mynode/lnd/data`                       | `/mnt/hdd/mynode/settings/.lndpw` |
| StartOS | `assets/import-startos.sh` | `start9` | the origin's `lnd` `main` volume, `data` subtree | the origin's `store.json`         |

All three scripts share one shape: `sshpass -e` (the password enters via the environment, and reaches the remote `sudo -S` over ssh's stdin — never the command string, so it stays off the remote process list and no character in it can break or inject into a shell), a 10-second connect timeout, `set -e` with `pipefail` so a failed remote `tar` fails the copy, streaming **only `data/`** (`lnd.conf`, the TLS pair, and the StartOS state files are never copied — this server's own remain in place), `tar -xo` to drop the origin's ownership, and a post-copy check that a wallet actually landed (`wallet.db`, or `chain.sqlite` for an already-converted StartOS origin) so a truncated stream is an error rather than an import.

Per-origin specifics: a StartOS origin is vetted before anything is stopped or copied — if its `startup-flags.json` reports `dbSchemaFinalized` without `dbMigrationComplete`, the origin was caught mid bolt → SQLite conversion with a half-converted channel database and the import is refused (no `startup-flags.json` means a pre-conversion release: plain `bolt`, proceeds) — and since `start-cli package stop` returns before the service is down, the script polls the origin until LND has actually stopped before copying. The origin is left stopped, never uninstalled: a stopped StartOS service stays stopped across reboots, and its data remains the fallback until the migrated node has proven itself.

**When the import fails** (origin unreachable at start time, its layout unexpected, a truncated copy), the **Wallet Import** health check pins the failure and the phase retries; after three consecutive failures it re-posts the **Initialize Wallet** critical task — which also stops the service — so there is always a UI route back to correct the address or password. While an import is pending, re-running a migration variant is allowed even though partial data may be on the volume (it re-copies from scratch); **Start Fresh** is refused in that state, because the partial data could be the only copy of a migrated channel state — recovering it means re-running the migration, and truly starting over means uninstall/reinstall.

### Reset Wallet Transactions

- **Name:** Reset Wallet Transactions
- **Purpose:** Rescan on-chain transactions from wallet birthday; useful for picking up missed transactions
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** None
- **Outputs:** None (restarts LND with `--reset-wallet-transactions`)

### Revoke Macaroons

- **Name:** Revoke Macaroons
- **Purpose:** Revoke all macaroons — rotates the macaroon root key and re-bakes every macaroon file
- **Visibility:** Enabled
- **Availability:** Any status
- **Inputs:** None
- **Outputs:** None
- **Warning:** Revokes every existing macaroon; dependent services lose access until they pick up the new one and may need restarting

**Deleting macaroon files does not revoke anything.** A macaroon is verified against the root key in the macaroon store, not against the file, so LND re-bakes the deleted files from the surviving key and a macaroon copied beforehand still authenticates. That was this action's behavior before `0.21.1-beta:11`.

Clearing the store by hand is not the fix either. Its location depends on the backend — bolt's `macaroons.db` on an older node, the `macaroondb_kv` table inside `chain.sqlite` once migrated (the `macaroons.db.migrated-to-sqlite-*` marker means the bolt file is a dead leftover and deleting it is a no-op). Worse, emptying it out-of-band leaves the on-disk macaroons signed with a key LND no longer holds, so every caller — including the package's own health check — fails with `signature mismatch after caveat verification`.

So the action does neither. It sets `rotateMacaroonRootKey` in `startup-flags.json` and restarts; the `unlock-wallet` oneshot in `main.ts` then unlocks through `/v1/changepassword` with `new_macaroon_root_key: true` instead of `/v1/unlockwallet`, passing the stored password unchanged in both fields. That is LND's supported rotation: it generates the new root key and rewrites the macaroon files in one step, so the node comes back consistent. A `clear-macaroon-rotation-flag` oneshot gated on `unlock-wallet` clears the flag afterwards, so a failed rotation retries on the next start and a successful one never repeats.

### Auto-Configure

- **Name:** Auto-Configure
- **Purpose:** Let a dependent service request specific `lnd.conf` settings through a one-click task, instead of asking the user to SSH in and edit the file by hand
- **Visibility:** Hidden — never listed in the actions menu; only surfaced as a task posted by a dependent service
- **Availability:** Any status
- **Inputs:** The requesting service supplies a partial set of config fields; the user sees only those fields, pre-filled and locked, and approves. Currently the form can expose **Enable Onion Messages (BOLT12)**, which writes `protocol.custom-message=513`, `protocol.custom-nodeann=39`, and `protocol.custom-init=39` to `lnd.conf` to enable onion-message support for BOLT12 offers (requested by services such as BOLT12 Pay / LNDK)
- **Outputs:** None

## Backups and Restore

**Backed up:** The entire `main` volume, **excluding** files that are rebuilt automatically — `data/graph`, `data/chain/bitcoin/mainnet/channel.db`, `data/chain/bitcoin/mainnet/sphinxreplay.db`, `data/chain/bitcoin/mainnet/neutrino.db`, `data/chain/bitcoin/mainnet/block_headers.bin`, `data/chain/bitcoin/mainnet/reg_filter_headers.bin`, and `logs` — plus `startup-flags.json`, which holds nothing a restore needs (post-restore and init recreate it, and `needsSqliteMigration` decides from files on disk) while a pending import in it would carry the origin's password into the backup.

**Restore behavior:** After restore, LND automatically runs `restorechanbackup` to request force-close of all channels from the Static Channel Backup. A persistent health check warning is displayed advising the user to sweep funds and reinstall LND fresh.

**Important:** Lightning Labs strongly recommends against continued use of a restored LND node. After recovery, sweep all on-chain funds to another wallet, uninstall LND, then reinstall fresh.

## Health Checks

| Check                      | Method                                                          | Grace Period | Messages                                                                                     |
| -------------------------- | --------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| **LND Server**             | HTTPS `GET /v1/state` on `127.0.0.1:8080` using `tls.cert`      | Default      | Success: "LND is ready" / Starting: (no message, waiting)                                    |
| **Network and Graph Sync** | `lncli getinfo` (synced_to_chain + synced_to_graph + num_peers) | Default      | Synced / Syncing to chain / Syncing to graph (with peer count, elapsed once slow) / Starting |
| **Node Reachability**      | Config check (conditional)                                      | N/A          | Disabled message if no external IP or hostname configured                                    |
| **Backup Restoration**     | Conditional (after restore)                                     | N/A          | Warning to sweep funds and reinstall                                                         |

The two startup phases (see [Startup phases](#startup-phases)) publish checks of their own while they run, written directly with `sdk.setHealth` rather than by a `ready` function: **Wallet Import** (`import`) and **Database Conversion** (`db-migration`). Each reports `loading` with the stage it is on — so the service badge reads _Running_ during work that can take hours — then `success`, or `failure` with the error. There is no API to delete a health entry, so a completed phase's entry stays on the page, at its terminal result, until the service is stopped.

The LND Server check calls the REST `/v1/state` endpoint and returns `success` once the server replies with any valid state JSON. It is a stronger readiness signal than a bare port-listening check — the port binds before LND is actually ready to serve RPCs — so dependent services (like Mempool) that gate on this health check will wait until LND can answer API calls.

When LND first reaches `synced_to_chain && synced_to_graph` after install, a **Sync Complete** notification is posted to the StartOS notifications panel. The notification fires only once per install — subsequent restarts that re-sync the chain or graph do not re-notify.

`synced_to_graph` is a per-process latch, and LND only sets it when the one peer it elected as the _initial historical syncer_ finishes reconciling the graph. The first peer to connect after a start gets elected, and until the latch is set every other peer is held in `PassiveSync` — passive syncers never send a `GossipTimestampRange`, so they deliver no gossip at all. One unresponsive elected peer therefore stalls the whole gossip subsystem, not just its own sync, and LND only re-elects when that peer disconnects or `historicalsyncinterval` (default 1h) elapses. A node with no channels is most exposed, because it keeps no persistent peers and re-draws its first peer from bootstrap on every start. This is why the check reports peer count and elapsed time: a large legitimate backfill and a stalled peer are indistinguishable from `getinfo` alone. `lncli disconnect <pubkey>` on the elected peer forces an immediate re-election.

LND's own liveness monitor is off — `healthcheck.chainbackend.attempts` is pinned to `0` in the [enforced section](startos/fileModels/lnd.conf.ts) of `lnd.conf`, against an upstream default of `3`. It is a much weaker signal than its name suggests: the check issues `uptime` and counts the backend's outbound peers, never retrieving a block, so it stays green against a backend that answers headers but cannot serve blocks — the failure mode of [bitcoin-core-startos#270](https://github.com/Start9Labs/bitcoin-core-startos/issues/270), which it would not have caught at any setting. Exhausting the attempts does **not** stop LND either: `Shutdown` is wired to `srvrLog.Criticalf` in `server.go` and has been since v0.14.3, so the consequence is one `[CRT]` log line. Re-enabling it would therefore buy a log line when bitcoind is genuinely unreachable — a defensible thing to want, but not a safety net, and orthogonal to the failure that prompted the question.

LND's disk-space and TLS checks report `configured with 0 attempts, skipping it` on every start as well; those two are off by **upstream** default (`defaultDiskAttempts`, `defaultTLSAttempts`) and are not set by this package.

## Dependencies

| Dependency | Required | Mounted Volume                      | Health Checks Required      | Purpose                                                        |
| ---------- | -------- | ----------------------------------- | --------------------------- | -------------------------------------------------------------- |
| Bitcoin    | Optional | `main` → `/mnt/bitcoin` (read-only) | `sync-progress`, `bitcoind` | Block data, transaction broadcasting via ZMQ + RPC cookie auth |
| Tor        | Optional | None                                | `tor`                       | Required (running) when "Enable Tor" is on (Tor Settings)      |

When using Bitcoin as backend, LND requires the listed health checks to pass on Bitcoin before starting. LND uses cookie authentication via the mounted `.cookie` file.

LND can alternatively use **Neutrino** (built-in light client) with no Bitcoin dependency.

Tor is likewise a marketplace service, not built into StartOS. It provides LND's outbound SOCKS proxy and the onion services used for inbound reachability, and becomes a required _running_ dependency whenever **Enable Tor** is on.

### DNS-seed bootstrapping under Tor

A node with no channels and no graph has only two ways to find a first peer: sample the channel graph, or resolve the BOLT-10 DNS seeds. The first is circular on a fresh install — the graph it would sample is the graph it hasn't downloaded — which leaves the seeds, and those need an SRV lookup.

SOCKS5 can't carry an SRV query, so with `tor.active` LND doesn't use the system resolver for it — `tor.LookupSRV` dials `tor.dns` over TCP itself. That collides with the StartOS **egress guard**, which drops container traffic to port 53 off the LXC bridge (`inet startos_egress_guard`, in `start-core`'s base nftables ruleset) — services are expected to resolve through the OS proxy at `10.0.3.1:53`, a host-local input-hook destination the guard never sees. LND's built-in `tor.dns` default is a public nameserver (`soa.nodes.lightning.directory:53`), and with **Skip for clearnet peers** on that dial goes out direct, into the guard. The rule is a `drop`, not a `reject`, so nothing comes back: the connection sits in `SYN_SENT` until LND's own timeout and every bootstrap round logs `Unable to retrieve initial bootstrap peers: no addresses found`. The node stays at zero peers and `synced_to_graph` never goes true.

`watchTorDns` sets `tor.dns` to the OS resolver so the query stays on the bridge. Like `tor.socks` it is written in every mode but one:

| Mode                                   | `tor.dns`   | Why                                                                                                                                                                                                     |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tor on, **Skip for clearnet peers** on | OS resolver | The affected path — the dial goes out direct, so it must target a resolver the guard doesn't drop                                                                                                       |
| Tor on, tor-only                       | unset       | LND's `dialProxy` bypasses SOCKS only under `skipProxyForClearNetTargets`, so here the dial is proxied and no exit would reach an RFC1918 address. Unaffected anyway: it goes to the SOCKS port, not 53 |
| Tor off                                | OS resolver | Parsed but never dialed — `ProxyNet` is only built under `tor.active`. Inert, as `tor.socks` is in this mode                                                                                            |

Two things to know before editing this. The value must be `host:port` — LND documents the flag that way, and while a bare host picks up `:53` from `verifyPort`, writing it explicitly matches the form of the default. And the key is normalized on **every** start regardless of `tor.active` (LND's `ParseAddressString` call sits above the `if cfg.Tor.Active` block in `config.go`), so whatever is written must always parse; an unresolvable value would abort startup even with Tor off.

Note this is only about how LND finds the seeds. With Tor off, DNS is unremarkable — the Go resolver follows `/etc/resolv.conf` to `10.0.3.1`, an input-hook destination the forward-hook guard never sees.

This only ever bit nodes bootstrapping from nothing. Once the graph is populated the graph bootstrapper carries the node on its own, which is why an established node never showed the symptom.

## Limitations and Differences

1. **Mainnet only** — testnet/regtest/signet are not available
2. **No `lncli create` or `lncli unlock`** — wallet lifecycle is fully automated by StartOS
3. **A few `lnd.conf` keys are StartOS-managed** — `externalip`/`externalhosts`, `tor.socks`, `tor.dns`, and the Bitcoin backend connection keys are re-derived on every start, so hand-edits to _those_ keys don't stick (use the corresponding action). Every other setting you put in `lnd.conf` is preserved across restarts — see [Editing `lnd.conf` directly](#editing-lndconf-directly)
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

Build and development workflow follow the StartOS packaging guide: <https://docs.start9.com/packaging>. Keep `README.md`, `instructions.md`, and `AGENTS.md` in sync with any change to user-visible behavior or package structure.

---

## Quick Reference for AI Consumers

```yaml
package_id: lnd
upstream_version: see manifest dockerTag
image: built from ./Dockerfile (lightninglabs/lnd + lndinit binary + curl, sqlite3, ssh, sshpass)
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
  - revoke-macaroons
  - autoconfig (hidden; dependent-driven, e.g. onion messages for BOLT12)
health_checks:
  - lnd_state: https GET /v1/state on 127.0.0.1:8080 (LND's own tls.cert)
  - lncli_getinfo: synced_to_chain, synced_to_graph, num_peers
  - reachability: conditional (no external address advertised)
  - restored: conditional (set after backup restore)
  - import: conditional (only on a start that runs a scheduled Initialize Wallet migration)
  - db-migration: conditional (only on a start that converts imported bolt data → sqlite)
backup_volumes:
  - main (excluding data/graph, channel.db, sphinxreplay.db, neutrino.db, block_headers.bin, reg_filter_headers.bin, logs)
```
