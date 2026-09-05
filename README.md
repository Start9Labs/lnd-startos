<p align="center">
  <img src="icon.svg" alt="LND Logo" width="21%">
</p>

# LND on StartOS

> Everything not listed in this document should behave the same as upstream
> LND. If a feature, setting, or behavior is not mentioned here, the upstream
> documentation is accurate and fully applicable — see the Documentation
> section of `instructions.md` for links.

[LND](https://github.com/lightningnetwork/lnd) is a Lightning Network node implementation. This package runs it on SQLite rather than bolt, issues and reissues its TLS certificate for the addresses StartOS assigns, and can create a wallet, restore one from a seed, or import one wholesale from another node.

- **Upstream repo:** <https://github.com/lightningnetwork/lnd>
- **Wrapper repo:** <https://github.com/Start9Labs/lnd-startos>

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

The image is built here because two extra binaries are needed alongside `lnd`.

| Property      | Value                                                                          |
| ------------- | ------------------------------------------------------------------------------ |
| Image         | Built from `Dockerfile` — upstream `lnd`, plus `lndinit`, `sqlite3`, `rclone`, `mutt`, `inotifywait`, and `jq` |
| Architectures | x86_64, aarch64                                                                |
| Subcontainer  | `lnd-sub` — the `lnd` daemon, the `channel-backup-watcher` daemon, and the one to `attach` to |

`lndinit` and `sqlite3` exist for the bolt-to-SQLite conversion described below. A separate `import-<source>` subcontainer is created when a wallet import is scheduled.

**`main` runs in one of three modes**, and only the third is the ordinary one:

1. **Import** — a wallet migration from another node is pending, so the only thing running is the copy.
2. **Conversion** — an imported bolt database has to be converted before LND may open it.
3. **Normal** — the LND daemon, the `channel-backup-watcher` daemon, and their supporting oneshots.

In normal mode the `channel-backup-watcher` daemon runs alongside LND inside `lnd-sub`. It watches `channel.backup` for changes using `inotifywait` and syncs it to configured backup providers (SFTP, Dropbox, Nextcloud, Google Drive, email) via `rclone` and `mutt`. It reads its configuration from `custom-config.json`.

## Volume and Data Layout

One volume, plus a read-only view of Bitcoin's.

| Volume | Mount Point  | Purpose                                                                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `main` | `/root/.lnd` | `lnd.conf`, the wallet and channel databases, the TLS pair, macaroons, `store.json`, and `startup-flags.json` |

Bitcoin's data directory is mounted **read-only** at `/mnt/bitcoin` when bitcoind is the backend — that is how LND reads its RPC cookie.

## File Models

Four models, and the split between the first two is load-bearing.

| File                 | Format | Modelled                | Written by                                                |
| -------------------- | ------ | ----------------------- | --------------------------------------------------------- |
| `lnd.conf`           | INI    | Yes — `FileHelper.ini`  | Every init, every start, and the config actions           |
| `store.json`         | JSON   | Yes — `FileHelper.json` | Install, and the wallet and watchtower actions            |
| `startup-flags.json` | JSON   | Yes — `FileHelper.json` | Actions, the restore hook, and `main` as it consumes them |
| `custom-config.json` | JSON   | Yes — `FileHelper.json` | The channel-backup watcher daemon and the wallet-unlock flag |

**`startup-flags.json` is deliberately not part of `store.json`.** `main` reads the store under a watch that restarts the service on any change, so clearing a consumed flag there would restart the service in a loop — the bug that once made Reset Wallet Transactions re-run on every start. The flags file is read once instead, and cleared without triggering anything.

### lnd.conf

**Enforced** — rewritten whenever the package writes the file: the three listen addresses, `bitcoin.mainnet`, `rpcmiddleware.enable`, and `db.backend`. `bitcoind.rpcuser`, `bitcoind.rpcpass`, and the deprecated `bitcoin.active` and `tor.v3` are modelled as "must be absent" and deleted — Bitcoin authentication is the cookie read through the mount.

Five values depart from LND's own defaults. The first two are enforced; the rest are starting points a config action can change:

| Key                                 | Upstream default | Set here          | Why                                                                                          |
| ----------------------------------- | ---------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `db.backend`                        | bolt             | `sqlite`          | New installs are born on SQLite; existing bolt nodes are converted before LND opens the data |
| `healthcheck.chainbackend.attempts` | 3                | `0`               | LND's own backend monitor is disabled — see below                                            |
| `debuglevel`                        | `info`           | `info,BTWL=error` | Keeps Info logging while silencing btcwallet's per-block warnings                            |
| `stagger-initial-reconnect`         | `false`          | `true`            | Spreads the startup reconnect burst over 30 s; the first 10 peers still dial immediately     |
| `caches.rpc-graph-cache-duration`   | `0` (disabled)   | `1m`              | One graph read answers simultaneous `DescribeGraph` callers instead of one read each         |

**On the graph cache:** LND ships the `DescribeGraph` cache off. `lncfg/caches.go` defines `DefaultRPCGraphCacheDuration = time.Minute`, but nothing wires it into `DefaultConfig`, so the field holds its zero value and `rpcserver.go` reads that as "disabled" — true in every release to date. Uncached, each call walks the whole graph, and concurrent callers each walk it separately. That is expensive here in particular: the graph lives in `lnd.sqlite` under `--db.use-native-sql`, behind a pool of two connections read a hundred rows at a time, so two simultaneous walks hold both connections and the gossiper's graph writes and any invoice query wait behind them. With the cache on, callers serialize on one mutex and only the first walks. Sixteen packages across the two registries depend on this node, and Mempool and Ride The Lightning both fetch `/v1/graph`. The cached response is not keyed on the request's `include_unannounced` flag, so a caller that asks for unannounced channels can leave them in the slot for the next caller that did not; Mempool and RTL both request public-only, and a short duration bounds the window.

**On the disabled backend check:** it is a much weaker signal than its name suggests. It issues `uptime` and counts the backend's outbound peers, never retrieving a block, so it stays green against a node that answers headers but cannot serve blocks. Exhausting its attempts does not stop LND either — the shutdown path is wired to a Critical log line and has been for many releases. Re-enabling it would buy a log line, not a safety net.

Two further keys are forced absent for correctness rather than preference: **`db.use-native-sql`**, because the conversion's bolt-mode run reads the same file and bolt rejects native SQL, so it is passed on the daemon's command line instead; and the three **onion-message protocol overrides**, which LND 0.21 advertises natively and which now make it abort at startup if still present.

**Derived, on every start:** the Bitcoin backend bundle — RPC host, cookie path, and both ZeroMQ addresses — resolved from Bitcoin's own bindings. Selecting Neutrino instead swaps the whole bundle out and sets a fee URL, because Neutrino cannot estimate fees locally.

**Yours:** everything the config actions expose — alias and colour, channel and routing-fee policy, autopilot, performance flags, Tor settings, and the watchtower server and client.

### store.json and startup-flags.json

`store.json` holds the wallet password, the seed if the package generated one, the registered watchtower clients, any custom external hosts, and — as the deliberate exception to the startup-flags rule — the pending wallet-password change and the error from a failed one. The change lives there, not in the flags file, because the store write that schedules it is what restarts `main` into the run that applies it (see [Wallet - Password](#security)). A stranded `pendingPasswordChange` is cleared at init so the two password actions can never stay disabled in "change in progress" forever.

`startup-flags.json` holds one-time requests: a pending wallet import (**including the origin node's password**, since nothing else persists it), a wallet-transaction reset, a macaroon rotation, a restore marker, and whether the sync notification has fired. Each is consumed by `main` and cleared once the work it asked for has run.

## Dependencies

Both are optional and conditional on configuration.

| Dependency | When                         | Kind      | Health checks               | Mount                     |
| ---------- | ---------------------------- | --------- | --------------------------- | ------------------------- |
| Bitcoin    | The backend is bitcoind      | `running` | `bitcoind`, `sync-progress` | `/mnt/bitcoin`, read-only |
| Tor        | Tor is enabled in the config | `running` | `tor`                       | none                      |

Choosing bitcoind also raises a `critical` task on **Bitcoin** requiring ZeroMQ — see [Tasks](#tasks).

The daemon **restarts when Bitcoin writes a replacement RPC cookie**, but not when the cookie merely disappears: an absent cookie means Bitcoin is down, and stopping LND at that moment hangs its shutdown.

## Network Access and Interfaces

Four interfaces, two of which appear only once a wallet exists.

| Interface        | Id                 | Type | Port  | Present                        |
| ---------------- | ------------------ | ---- | ----- | ------------------------------ |
| Peer             | `peer`             | p2p  | 9735  | always                         |
| Watchtower       | `watchtower`       | p2p  | 9911  | always exported                |
| REST LND Connect | `lnd-connect-rest` | api  | 8080  | once the admin macaroon exists |
| gRPC LND Connect | `grpc`             | api  | 10009 | once the admin macaroon exists |

**The two connect interfaces embed credentials in their address.** Each carries the macaroon — and, for gRPC, the server's root CA certificate, DER-encoded as the `lndconnect` scheme specifies — as query parameters, which is what lets a wallet app pair by scanning one. Both are masked for that reason. They cannot exist before the wallet is created, because the macaroon does not exist until then; the package watches for it and publishes them when it appears.

**REST and gRPC are terminated differently, and not interchangeably.** REST goes through the reverse proxy. gRPC does not: a proxy rewrap negotiates no ALPN, and gRPC clients reject the connection outright for it — so its binding passes TLS through and the client validates the certificate LND itself serves, anchored on the root CA its connect URI carries.

**The watchtower interface is always exported**, even when the server is off. LND simply does not listen on it until the server is enabled.

## Installation and First-Run Flow

Install raises **two `critical` tasks** and the service does not run until both are cleared: choose a Bitcoin backend, and set up a wallet.

Wallet setup is the substantial one, and [Initialize Wallet](#actions) offers three paths:

- **Create** a new wallet, generating a seed the package records.
- **Restore** from an existing seed.
- **Import** an entire node from Umbrel, myNode, or another StartOS — copying its data directory over the network.

An import changes what happens next. The copy runs as the only thing in the service, bounded at six hours because a busy routing node's channel database is multi-gigabyte over LAN. If the imported node was on bolt, a **conversion phase** then runs before LND is allowed to open the data, reporting its own progress as a separate health check. Only after that does LND itself start.

The TLS pair is issued at init for every address LND answers on — the container and bridge addresses, plus every address the gRPC interface is served at — and **reissued whenever that set changes**. The internal half is what REST needs, since the proxy dials the container by IP; the external half is what a gRPC client validates against, since nothing terminates that binding's TLS but LND.

## Actions

Twenty-four actions. The seven visible group under Configuration write the node's config, wallet and credential operations sit under Security, two are read-only, and three are hidden.

### Configuration

Seven actions grouped under Configuration, each writing its own part of `lnd.conf`: **General Settings** (alias, colour, keysend and AMP), **Routing Fees**, **Channel Settings** (acceptance policy plus the forwarding switch), **Autopilot Settings**, **Tor Settings**, **Custom External Host**, and **Performance**. Each costs seconds plus a restart, is pre-filled from the current file, and is safe to re-run.

**Bitcoin Backend** is `visibility: 'hidden'` — it is reached through the install task rather than browsed to. It chooses bitcoind or Neutrino, and with it the dependency set, the mount, and the whole backend section of the config.

**Channel Settings** carries `reject-htlc` ("Reject Routing Requests"), the node-wide forwarding switch. When on, LND fails every onward HTLC with `FailChannelDisabled` and logs `node configured to disallow forwards`; sending and receiving are unaffected, since locally-sourced and final-hop HTLCs never reach the switch's forwarding path. The channels stay announced and enabled in gossip, so peers keep attempting routes and keep failing — it rejects forwards, it does not remove the node from the graph. Restart-only; there is no runtime toggle.

### Security

A group of twelve actions covering the on-chain seed, channel-backup, wallet password, and watchtower:

**Aezeed Cipher Seed** — displays the on-chain only seed, and is disabled (hidden) if the seed was not retained. It is the on-chain seed, not a BIP-39 seed, and does **not** recover channel funds. Used with a StartOS backup (the SCB) a seed restores the wallet; used alone it restores only on-chain funds.

**Aezeed Cipher Seed - Backup** — confirm the seed by typing three of its words in positions chosen at random. This unlocking feature is part of the security posture: the seed is present on the server until you confirm it is backed up and then delete it, and the **Security Status** health check reports it.

**Aezeed Cipher Seed - Delete** — removes the seed from `store.json`, so an attacker that gets the server cannot convert it to a BIP32 HD root key to sweep on-chain funds. Requires first confirming the backup and disabling auto-unlock (otherwise the wallet is already accessible).

**Channels - Auto-Backup** runs a background watcher that uploads `channel.backup` to SFTP, Dropbox, Nextcloud, Google Drive, or a fixed set of email recipients every time it changes (that is, every channel open, close, or update). When LND writes a closer update to `channel.backup`, the watcher syncs the file to every enabled provider. Because a stale `channel.backup` cannot recover channels state the network has moved past, this is a redundancy for the StartOS backups — it reproduces the same file, and both should be kept.

**Channels - Test Auto-Backup** runs the watcher's backup once on demand, so a provider can be verified without opening a channel.

- **What it changes:** only a file write into the volume; the watcher reads it and mirrors it.
- **Cost:** on a stopped or idle node it is instantaneous; on a running node it exchanges the file through a temporary container.
- **Repeat safety:** safe to re-run.

**Wallet - Auto Unlock** — toggles whether LND unlocks automatically on start. With auto-unlock **on** (the default) the wallet password is stored on the server, and anyone with physical access to the machine — e.g. who resets StartOS's master password — can use the unlocked wallet to take the funds. Turning it **off** deletes the password from the server; the wallet is then unlocked manually by you each time the node restarts. Disabling it requires first confirming the password backup (see below). The **Security Status** health check turns green only when auto-unlock is off.

**Wallet - Manual Unlock** — unlocks a wallet whose auto-unlock is disabled. It appears as a task on the dashboard while the node is up but the wallet is locked, and is disabled with **UNLOCKED** once the wallet has been unlocked (the flag lives in `custom-config.json`, reset to locked on every LND start under auto-unlock-off).

**Wallet - Password** — shows or changes the wallet password. Changing it stages the *current* password, the new password (base64 so it is never logged), and `autoUnlockEnabled: true` into `store.json` and restarts LND. The pending change is read from the store (it is the one deliberate exception to the startup-flags rule: the store write is what restarts `main` into the run that applies it) and applied at the **top** of the wallet-unlock oneshot, while the wallet is still `LOCKED` — LND's `changepassword` endpoint is served only by the unchanged WalletUnlocker, so a change scheduled after unlocking always fails. After the change succeeds the wallet is already unlocked, the new password is adopted, and `main` restarts into normal operation. A password change is a deliberate interruption of the wallet's operating (all clients connected to LND are disconnected and must re-pair).

A change also **resets the Wallet - Password Backup confirmation**, because the previously backed-up password is now stale. When auto-unlock is **off** the change temporarily turns it **on** — the password is deliberately not on the server, so staging it is the only way the oneshot can reach `changepassword`. After the restart the new password is on the server again (auto-unlock on), so you can confirm the new password backup; turn auto-unlock back off afterwards. If the change cannot be applied, the pending flag is cleared and the failure is recorded as an error rather than stranding the actions in "change in progress" forever; init also clears any stranded flag on every boot.

**Wallet - Password Backup** — requires you to type the wallet password back to confirm you have it saved. This is a prerequisite for turning off **Auto-Unlock**. It is reset to unconfirmed automatically whenever the wallet password is changed, and it cannot be re-confirmed without knowing the (new) password.

**Watchtower - Client** — edits the watchtower client settings in `lnd.conf`.

**Watchtower - Server** — enables or disables the watchtower server. Setting the address to 'none' disables it and permanently deletes the backup data it holds for client nodes. Additionally deletes the watchtower server's database when the server is switched off, so a disabled tower does not keep client session state it can no longer serve.

**Watchtower - Server Info** — read-only, running only. Reports the watchtower server's identity, and is hidden unless that server is enabled.

### Initialize Wallet — hidden

**Not in the Actions list.** It is `visibility: 'hidden'` and `only-stopped`, reached through the install task. It creates, restores, or imports a wallet as described above, and for an import it verifies the origin's credentials before scheduling the copy — so a wrong password fails here rather than six hours later. Re-running it with corrected credentials replaces the pending import without disturbing anything else.

### Reset Wallet Transactions

Rescans the chain, rebuilding the wallet's transaction history. Run it when on-chain balances or transactions look wrong.

- **What it changes:** sets a one-time flag and restarts LND, which does the rescan on its next start; the flag is cleared afterwards so it does not repeat.
- **Cost:** a full rescan, which takes time proportional to the wallet's age.
- **Repeat safety:** safe to re-run.

### Revoke Macaroons

Rotates the macaroon root key, invalidating **every** macaroon this node has issued.

- **What it changes:** sets a one-time flag; the rotation happens at the next start.
- **Repeat safety:** safe, but every application connected to this node must be re-paired afterwards — including through the connect interfaces above, which are regenerated with the new macaroon.
- **When to run it:** if a macaroon may have been exposed. Note that a service reading LND's admin macaroon through a mount has full control of the node, which is why other packages' security fixes sometimes ask you to run this.

### Node Info

Read-only, running only. Reports the node's identity, URIs, and sync state.

### Auto-Configure — hidden

`visibility: 'hidden'`; how a dependent service requests configuration of this node.

## Tasks

Two at install, one raised on Bitcoin, plus a manual-unlock task while the wallet is up but locked with auto-unlock off.

| Task              | Raised on | Severity   | Raised when                                        | Cleared when                                          |
| ----------------- | --------- | ---------- | -------------------------------------------------- | ----------------------------------------------------- |
| Initialize Wallet | this      | `critical` | At install                                         | The action runs                                       |
| Bitcoin Backend   | this      | `critical` | At install                                         | The action runs                                       |
| Auto-Configure    | Bitcoin   | `critical` | The backend is bitcoind and its ZeroMQ is disabled | Bitcoin's config matches; it returns if changed again |
| Wallet - Manual Unlock | this  | `important` | Wallet initialized and auto-unlock disabled         | The wallet is unlocked                                |

The Bitcoin task appears on **Bitcoin's** page with nothing there explaining which service asked for it. LND needs ZeroMQ to be told about new blocks and transactions; polling is not a substitute.

## Health Checks

Which checks exist depends on what the service is doing.

| Check           | Displayed                         | Present                                  |
| --------------- | --------------------------------- | ---------------------------------------- |
| `import`        | Wallet Import progress            | While a wallet import is running         |
| `db-migration`  | "Database Conversion"             | While a bolt database is being converted |
| `lnd`           | "LND Server"                      | Normal operation                         |
| `sync-progress` | "Network and Graph Sync Progress" | Normal operation                         |
| `reachability`  | "Node Reachability"               | Normal operation                         |
| `restored`      | Restore notice                    | After a seed restore                     |
| `wallet-status` | "Wallet Status"                   | Normal operation                         |
| `security-status` | "Security Status"               | Normal operation                         |

The `channel-backup-watcher` daemon contributes a status (enabled or disabled) but no named health check of its own.

**`security-status` summarises the Security posture** in one line: channels auto-backup on or off, wallet auto-unlock on or off, whether the on-chain seed is still on the server, and whether a watchtower client is enabled. It returns `disabled` whenever that "secure" ideal (backup on, auto-unlock off, seed deleted, watchtower client on) is not met. Several settings it depends on are deliberately _not_ the secure default — auto-unlock defaults to on and the seed stays until deleted — so a fresh node reports `disabled` until you tighten them.

**`wallet-status`** reflects whether the wallet is unlocked, and when it is not, why. It reads `/v1/state` rather than `lncli getinfo`, because the gRPC service reports "in the process of starting up" until the wallet is unlocked — indistinguishable from a genuine startup — whereas `/v1/state` says `LOCKED` outright. It holds at "starting" for the first **10 seconds** of a lock so it never flashes an alarm on the brief stop a correct auto-unlock password takes on its way to unlocking, then reports differently for a wallet that auto-unlocks (password may be wrong) versus one that is locked waiting for the manual unlock.

**`sync-progress` covers two different syncs** — the chain and the network graph — and a node can be caught up on one while still working through the other. It is the check to read while a node is coming up for the first time.

**The graph half can stall on one bad peer, and the check is written to show it.** `synced_to_graph` is a per-process latch that LND sets only when the single peer it elected as the _initial historical syncer_ finishes reconciling the graph. The first peer to connect after a start gets elected, and until the latch is set every other peer is held in `PassiveSync` — passive syncers never send a `GossipTimestampRange`, so they deliver no gossip at all. One unresponsive elected peer therefore stalls the whole gossip subsystem rather than just its own sync, and LND re-elects only when that peer disconnects or `historicalsyncinterval` (default one hour) elapses. A node with no channels is the most exposed, because it keeps no persistent peers and re-draws its first peer from bootstrap on every start.

That state is indistinguishable from a large legitimate backfill through `getinfo` alone, so the message reports what can be distinguished: _Waiting for peers_ when none are connected, a plain _Syncing to graph_ while the wait is still normal, and — past fifteen minutes — how long the sync has been pending, with the peer count, where it is finally diagnostic. **The result stays `loading` in every one of those cases**, so nothing about the wait changes what dependent services see.

`lncli disconnect <pubkey>` on the elected peer forces an immediate re-election, and restarting LND has the same effect by drawing a new first peer.

**`reachability` reports whether peers can actually open a connection to you**, which is separate from whether LND is healthy. A node that is running fine but unreachable will not receive inbound channels.

**`import` and `db-migration` are progress reporters, not fault detectors.** They exist because both phases can run for hours with the service otherwise looking idle, and both report a real failure with its message if they hit one.

## Backups and Restore

The `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')` — with a substantial exclude list, and the exclusions are the substance.

- **Excluded:** the network graph, the channel database, the sphinx replay database, the Neutrino chain data and header files, the logs, and `startup-flags.json`.
- **Included:** `lnd.conf`, `store.json` with the wallet password and seed, `custom-config.json` with the channel-backup targets, the TLS pair, the macaroons, and the wallet database.

**The channel database is deliberately not backed up.** Restoring a stale one claims channel states the network has moved past, which is how funds are lost — so a restore recovers the wallet and relies on static channel backups to close channels cooperatively, rather than resuming them.

`startup-flags.json` is excluded for a second reason: a pending import carries the origin node's password in clear text, which must not ride into a backup. On restore the package sets the restore marker and clears any pending import outright — re-running Initialize Wallet is the way to migrate again.

### What a restore actually does

StartOS restores the wallet database (`wallet.db` or `chain.sqlite`) and `channel.backup` directly from the volume backup. It does **not** re-create the wallet from the seed — the wallet file already contains the derived keys. The seed stored in `store.json` (if present) is a human-readable reference only and is never used programmatically during restore. Deleting the aezeed seed from `store.json` has no effect on backups or restores.

The restore sequence on next boot:

1. The wallet database is already on disk from the volume restore.
2. `unlock-wallet` oneshot runs. If auto-unlock is on (password in `store.json`), the wallet unlocks automatically with `recovery_window: 2500` for chain rescan. If auto-unlock is off, the oneshot skips and the user must run **Wallet - Manual Unlock** from the Dashboard.
3. `restorechanbackup` runs `lncli restorechanbackup --multi_file channel.backup`, which cooperatively closes every channel from the Static Channel Backup. It retries automatically until the wallet is unlocked.
4. `clear-restore-flag` clears the restore marker so it does not re-run.

## Limitations and Differences

1. **A restore is a recovery, not a resumption.** The channel database is excluded by design; channels are closed from static backups rather than continued.
2. **SQLite is the only database backend.** New installs start there and bolt nodes are converted on arrival; the conversion is one-way.
3. **LND's own chain-backend health check is disabled**, because it does not detect the failure it appears to.
4. **gRPC cannot be reached through a TLS-terminating path** — its clients reject the rewrap.
5. **REST and gRPC interfaces do not exist until a wallet does**, because they embed the admin macaroon.
6. **Bitcoin must have ZeroMQ enabled**, which is requested as a task on that service.
7. **Onion-message protocol overrides are stripped**, since LND 0.21 advertises the feature natively and the old overrides now prevent startup.
8. **An import is bounded at six hours** and copies over the network from the origin node.
9. **No riscv64 build.** x86_64 and aarch64 only.

---

## Quick Reference for AI Consumers

```yaml
package_id: lnd
image: ./Dockerfile # upstream lnd, plus lndinit and the sqlite3 CLI
architectures:
  - x86_64
  - aarch64
subcontainers:
  - lnd-sub # the running daemon
  - import-umbrel # created only for a scheduled import (also -mynode, -startos)
volumes:
  main: /root/.lnd
file_models:
  - /root/.lnd/lnd.conf
  - /root/.lnd/store.json
  - /root/.lnd/startup-flags.json # excluded from backups; can hold an origin password
  - /root/.lnd/custom-config.json # channel-backup config and wallet-unlock flag
startos_managed_env_vars: []
dependencies: # both conditional on configuration
  - bitcoind # when the backend is bitcoind; /mnt/bitcoin, read-only
  - tor # when Tor is enabled
interfaces:
  peer: { type: p2p, port: 9735 }
  watchtower: { type: p2p, port: 9911 } # exported always; LND listens only when enabled
  lnd-connect-rest: { type: api, port: 8080 } # once the macaroon exists; embeds it
  grpc: { type: api, port: 10009 } # once the macaroon exists; TLS passthrough
actions:
  - general
  - routing-fees-config
  - channels-config
  - autopilot-config
  - tor-config
  - custom-external-host-config
  - performance-config
  - watchtower-server-config
  - watchtower-client-config
  - backend-config # hidden; raised by task
  - initialize-wallet # hidden, only-stopped; raised by task
  - reset-wallet-transactions
  - revoke-macaroons
  - aezeed-cipher-seed # Security; hidden if seed deleted
  - aezeed-cipher-seed-backup # Security; requires 3-word challenge
  - aezeed-cipher-seed-delete # Security; requires backup confirmed
  - channels-auto-backup # Security; channel backup provider config
  - channels-test-auto-backup # Security; manual backup trigger
  - wallet-auto-unlock # Security; toggle auto-unlock
  - wallet-manual-unlock # Security; hidden when wallet is unlocked
  - wallet-password # Security; view/change password
  - wallet-password-backup # Security; confirm backup
  - node-info # only-running
  - tower-info # only-running; hidden unless the tower is enabled
  - autoconfig # hidden; driven by dependents
tasks:
  - { action: initialize-wallet, severity: critical }
  - { action: backend-config, severity: critical }
  - { action: autoconfig, severity: critical } # on bitcoind, for ZeroMQ
  - { action: wallet-manual-unlock, severity: important } # when auto-unlock disabled
health_checks:
  - lnd # displayed "LND Server"
  - sync-progress # displayed "Network and Graph Sync Progress"; synced_to_chain, synced_to_graph, num_peers
  - reachability # displayed "Node Reachability"
  - wallet-status # displayed "Wallet Status"
  - security-status # displayed "Security Status"; all-green = secure posture
  - import # only while a wallet import runs
  - db-migration # only while a bolt database is converted
  - restored # only after a seed restore
```
