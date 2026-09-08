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

The image is built here because three extra binaries and one script are needed alongside `lnd`.

| Property      | Value                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Image         | Built from `Dockerfile` — upstream `lnd`, plus `lndinit`, the `sqlite3` CLI, `rclone` and `backup-agent.sh` |
| Architectures | x86_64, aarch64                                                                                             |
| Subcontainers | `lnd-sub` — the `lnd` daemon, and the one to `attach` to; `channel-backup-sub` — the channel-backup agent   |

`lndinit` and `sqlite3` exist for the bolt-to-SQLite conversion described below; `rclone` and `backup-agent.sh` keep `channel.backup` current on the configured targets. A separate `import-<source>` subcontainer is created when a wallet import is scheduled.

**`main` runs in one of three modes**, and only the third is the ordinary one:

1. **Import** — a wallet migration from another node is pending, so the only thing running is the copy.
2. **Conversion** — an imported bolt database has to be converted before LND may open it.
3. **Normal** — the LND daemon, the channel-backup agent, and their supporting oneshots.

## Volume and Data Layout

One volume, plus a read-only view of Bitcoin's.

| Volume | Mount Point  | Purpose                                                                                                       |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `main` | `/root/.lnd` | `lnd.conf`, the wallet and channel databases, the TLS pair, macaroons, `store.json`, and `startup-flags.json` |

Bitcoin's data directory is mounted **read-only** at `/mnt/bitcoin` when bitcoind is the backend — that is how LND reads its RPC cookie.

## File Models

Five models, and the split between two of them is load-bearing.

| File                         | Format | Modelled                | Written by                                                |
| ---------------------------- | ------ | ----------------------- | --------------------------------------------------------- |
| `lnd.conf`                   | INI    | Yes — `FileHelper.ini`  | Every init, every start, and the config actions           |
| `store.json`                 | JSON   | Yes — `FileHelper.json` | Install, and the wallet and watchtower actions            |
| `startup-flags.json`         | JSON   | Yes — `FileHelper.json` | Actions, the restore hook, and `main` as it consumes them |
| `channel-backup.json`        | JSON   | Yes — `FileHelper.json` | The Configure Channel Backups action                      |
| `.channel-backup-state.json` | JSON   | Yes — `FileHelper.json` | `backup-agent.sh`, on every backup attempt                |

**`channel-backup.json` holds the credentials for each backup target** — an app password, an OAuth refresh token, or an SSH private key, depending on the target. It is included in the StartOS backup because a restore needs it to find the current `channel.backup` again. `.channel-backup-state.json` is excluded, so a restored node reports its own backup health rather than the health of the machine it came from.

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

`store.json` holds the wallet password, the seed if the package generated one, the registered watchtower clients, and any custom external hosts.

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

Eighteen actions. Ten configure the node, three are wallet and credential operations, two cover channel backups, and three are hidden.

### Configuration

Nine actions grouped under Configuration, each writing its own part of `lnd.conf`: **General Settings** (alias, colour, keysend and AMP), **Routing Fees**, **Channel Settings** (acceptance policy plus the forwarding switch), **Autopilot Settings**, **Tor Settings**, **Custom External Host**, **Performance**, **Watchtower Server**, and **Watchtower Client Settings**. Each costs seconds plus a restart, is pre-filled from the current file, and is safe to re-run.

**Bitcoin Backend** is in the same group but `visibility: 'hidden'` — it is reached through the install task rather than browsed to. It chooses bitcoind or Neutrino, and with it the dependency set, the mount, and the whole backend section of the config.

**Watchtower Server** additionally deletes the watchtower server's database when the server is switched off, so a disabled tower does not keep client session state it can no longer serve.

**Channel Settings** carries `reject-htlc` ("Reject Routing Requests"), the node-wide forwarding switch. When on, LND fails every onward HTLC with `FailChannelDisabled` and logs `node configured to disallow forwards`; sending and receiving are unaffected, since locally-sourced and final-hop HTLCs never reach the switch's forwarding path. The channels stay announced and enabled in gossip, so peers keep attempting routes and keep failing — it rejects forwards, it does not remove the node from the graph. Restart-only; there is no runtime toggle.

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

### Node Info, Watchtower Server Info

Read-only, running only. The first reports the node's identity, URIs, and sync state; the second reports the watchtower server's identity, and is hidden unless that server is enabled.

### Configure Channel Backups, Back Up Channels Now

Grouped under Backups. `channel.backup` is LND's static channel backup: the file a restore needs to ask your peers to close your channels and return your funds. LND rewrites it whenever your channel set changes, and encrypts it under a key derived from the wallet seed, so a storage provider only ever holds ciphertext.

**Configure Channel Backups** takes any combination of Google Drive, Dropbox, Nextcloud and SFTP. Each target has its own enable toggle, so turning one off keeps its saved credentials. Google and Dropbox use an authorization-code exchange: submit once with the client credentials to get a link, approve it, then paste the code back and submit again. Targets on this same server, and Tor `.onion` targets, are rejected; Nextcloud must be `https://`, and an SFTP key must be an unencrypted OpenSSH key, since rclone has no way to enter a passphrase.

SFTP servers are pinned by host key, and the pin is confirmed before it is used. Saving the target records the keys the server presents (`ssh-keyscan`) and reports their fingerprints, but nothing is sent until a later save with _Host key verified_ turned on; the health check says so in the meantime. A changed host or port drops the pin, as does _Record a new host key_ after a server reinstall. Folder paths on every target must be relative, with no `..` segments.

- **What it changes:** writes `channel-backup.json`. No restart.
- **Repeat safety:** safe; secrets are never prefilled, and left blank they keep their stored value. A changed OAuth client id or secret drops the stored token, and a fresh authorization code always replaces it.

**Back Up Channels Now** runs one copy immediately and fails with whatever each target said, so a freshly configured target can be checked without waiting for a channel to open. It is also the way past a copy the daemon refuses to overwrite (see Backups and Restore): it archives that copy on the target and continues.

- **Cost:** seconds to a minute; running only. Refused while a restore is pending.

### Auto-Configure — hidden

`visibility: 'hidden'`; how a dependent service requests configuration of this node.

## Tasks

Three at install, plus one raised on Bitcoin.

| Task                      | Raised on | Severity    | Raised when                                        | Cleared when                                          |
| ------------------------- | --------- | ----------- | -------------------------------------------------- | ----------------------------------------------------- |
| Initialize Wallet         | this      | `critical`  | At install                                         | The action runs                                       |
| Bitcoin Backend           | this      | `critical`  | At install                                         | The action runs                                       |
| Configure Channel Backups | this      | `important` | At install                                         | The action runs                                       |
| Auto-Configure            | Bitcoin   | `critical`  | The backend is bitcoind and its ZeroMQ is disabled | Bitcoin's config matches; it returns if changed again |

The Bitcoin task appears on **Bitcoin's** page with nothing there explaining which service asked for it. LND needs ZeroMQ to be told about new blocks and transactions; polling is not a substitute.

## Health Checks

Which checks exist depends on what the service is doing.

| Check            | Displayed                         | Present                                                |
| ---------------- | --------------------------------- | ------------------------------------------------------ |
| `import`         | Wallet Import progress            | While a wallet import is running                       |
| `db-migration`   | "Database Conversion"             | While a bolt database is being converted               |
| `lnd`            | "LND Server"                      | Normal operation                                       |
| `sync-progress`  | "Network and Graph Sync Progress" | Normal operation                                       |
| `channel-backup` | "Channel Backup"                  | Normal operation; `disabled` until a target is enabled |
| `reachability`   | "Node Reachability"               | Normal operation                                       |
| `restored`       | Restore notice                    | After a seed restore                                   |

**`sync-progress` covers two different syncs** — the chain and the network graph — and a node can be caught up on one while still working through the other. It is the check to read while a node is coming up for the first time.

**The graph half can stall on one bad peer, and the check is written to show it.** `synced_to_graph` is a per-process latch that LND sets only when the single peer it elected as the _initial historical syncer_ finishes reconciling the graph. The first peer to connect after a start gets elected, and until the latch is set every other peer is held in `PassiveSync` — passive syncers never send a `GossipTimestampRange`, so they deliver no gossip at all. One unresponsive elected peer therefore stalls the whole gossip subsystem rather than just its own sync, and LND re-elects only when that peer disconnects or `historicalsyncinterval` (default one hour) elapses. A node with no channels is the most exposed, because it keeps no persistent peers and re-draws its first peer from bootstrap on every start.

That state is indistinguishable from a large legitimate backfill through `getinfo` alone, so the message reports what can be distinguished: _Waiting for peers_ when none are connected, a plain _Syncing to graph_ while the wait is still normal, and — past fifteen minutes — how long the sync has been pending, with the peer count, where it is finally diagnostic. **The result stays `loading` in every one of those cases**, so nothing about the wait changes what dependent services see.

`lncli disconnect <pubkey>` on the elected peer forces an immediate re-election, and restarting LND has the same effect by drawing a new first peer.

**`reachability` reports whether peers can actually open a connection to you**, which is separate from whether LND is healthy. A node that is running fine but unreachable will not receive inbound channels.

**`import` and `db-migration` are progress reporters, not fault detectors.** They exist because both phases can run for hours with the service otherwise looking idle, and both report a real failure with its message if they hit one.

## Backups and Restore

The `main` volume is copied wholesale — `sdk.Backups.ofVolumes('main')` — with a substantial exclude list, and the exclusions are the substance.

- **Excluded:** the network graph, the channel database, the sphinx replay database, the Neutrino chain data and header files, the logs, `startup-flags.json`, `.channel-backup-state.json`, and `channel.backup.restored`.
- **Included:** `lnd.conf`, `store.json` with the wallet password and seed, the TLS pair, the macaroons, the wallet database, `channel.backup`, and `channel-backup.json`.

**The channel database is deliberately not backed up.** Restoring a stale one claims channel states the network has moved past, which is how funds are lost — so a restore recovers the wallet and relies on the static channel backup, which asks each peer to force-close and return the funds, rather than resuming the channels.

`startup-flags.json` is excluded for a second reason: a pending import carries the origin node's password in clear text, which must not ride into a backup. On restore the package sets the restore marker and clears any pending import outright — re-running Initialize Wallet is the way to migrate again.

### Where the static channel backup comes from

A StartOS backup carries the `channel.backup` that existed when it was taken, so a channel opened since then is not in it and its funds are not recovered. Configure Channel Backups keeps a copy off the server that is updated whenever the channel set changes, which closes that window.

Every target holds `channel.backup`, the newest copy for a person to find; `channel.backup.meta`, a plaintext marker naming the current record by generation and node; one immutable record per copy shipped, `channel.backup.<generation>.<node>`, of which the newest twenty of this node's are kept; and `channel.backup.unknown-<time>` for any copy found there without a marker. The record is written first and the marker last, so a run cut off anywhere leaves every record intact and a marker that names a complete one. A generation is a timestamp that only ever increases on a node; the node id is minted once and lives in the state file, which is excluded from backups, so a restored node gets a fresh one and never mistakes the copies of the node it came from for its own. Shipped generations are tracked per destination, not per provider slot, so pointing a slot at a different folder starts over.

On a restore the `restore` oneshot waits for LND's RPC server, then asks the agent for candidates: every target with complete credentials, enabled or not, whose marker is newer than the watermark that travelled inside the StartOS backup, newest first. Each candidate's record is pulled to `channel.backup.restored` and handed to `restorechanbackup`; one LND refuses is recorded by destination, generation and node and the next tried, and the `channel.backup` from the StartOS backup itself comes last. An answer that says LND was not ready, or an agent step that cannot record its outcome, fails the oneshot so the SDK retries it with the flag still set; only what LND accepts is committed, and "channel already exists" on a retry counts as accepted.

- **A target is newer** — its record is restored, and the watermark and the node's incorporated generation move up to it.
- **No target is newer, or none is reachable** — the `channel.backup` from the StartOS backup is used, exactly as before.
- **The newest target is older than the watermark** — the target has been rolled back. The backup's own copy is used, and the Channel Backup health check says so until the next successful copy replaces the rolled-back one.
- **A target cannot be compared** — unreachable, or its marker unreadable — it is skipped here and, below, never overwritten.

A restore finds a target where the StartOS backup's `channel-backup.json` says it is, so after changing a target's location, take a new StartOS backup.

The oneshot runs after the wallet unlocks, because LND rewrites its own `channel.backup` shortly after unlocking; pulling to a separate path is what keeps that rewrite from racing the pull. The agent also stops uploading while a restore is pending, so the stale file LND writes on the way through is never shipped over a good copy.

**Nothing this node did not write is overwritten without a trace.** Before every upload the agent lists the target and reads its marker:

- A marker carrying this node's id means a record of its own is current; the copy and marker are replaced in place.
- Another node's marker at or below the generation this node last accepted from a restore — the copy a restore was taken from, a rolled-back one — is kept aside under its record name if that record is missing, then replaced.
- Another node's marker above anything this node has seen holds channels it does not know about: a restore that could not reach that target left it behind, or two nodes share a folder. The upload is skipped, every other target is still served, and the health check names the target and says what to do: retrieve the file and run `restorechanbackup` with it, or run Back Up Channels Now, which keeps it under its record name and continues.
- A copy with no marker is kept as `channel.backup.unknown-<time>`, then replaced.
- A marker that cannot be read, or a target that cannot be listed, is left untouched and reported.

The daemon re-sends every copy daily even when nothing changed, so a deleted copy or a revoked credential surfaces within a day. The watcher, Back Up Channels Now and the restore steps share one lock; the manual run does not wait for it and reports when a cycle is already running.

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
  - channel-backup-sub # the channel-backup agent
  - import-umbrel # created only for a scheduled import (also -mynode, -startos)
volumes:
  main: /root/.lnd
file_models:
  - /root/.lnd/lnd.conf
  - /root/.lnd/store.json
  - /root/.lnd/startup-flags.json # excluded from backups; can hold an origin password
  - /root/.lnd/channel-backup.json # backup targets and their credentials
  - /root/.lnd/.channel-backup-state.json # excluded from backups; the agent's outcomes
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
  - node-info # only-running
  - tower-info # only-running; hidden unless the tower is enabled
  - autoconfig # hidden; driven by dependents
  - configure-channel-backup
  - backup-channels-now # only-running
tasks:
  - { action: initialize-wallet, severity: critical }
  - { action: backend-config, severity: critical }
  - { action: autoconfig, severity: critical } # on bitcoind, for ZeroMQ
  - { action: configure-channel-backup, severity: important }
health_checks:
  - lnd # displayed "LND Server"
  - sync-progress # displayed "Network and Graph Sync Progress"; synced_to_chain, synced_to_graph, num_peers
  - channel-backup # displayed "Channel Backup"; disabled until a target is configured
  - reachability # displayed "Node Reachability"
  - import # only while a wallet import runs
  - db-migration # only while a bolt database is converted
  - restored # only after a seed restore
```
