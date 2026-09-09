# LND

## Documentation

- [Start9 Bitcoin Guides](https://docs.start9.com/bitcoin-guides/) — connecting wallets and dashboards to a Lightning node on StartOS, and migrating an existing LND node onto one.
- [LND operator documentation](https://docs.lightning.engineering/lightning-network-tools/lnd) — the upstream guide to running and configuring LND.

## What you get on StartOS

A full **LND** node on Bitcoin mainnet, with **REST** and **gRPC** LND Connect interfaces, a **Peer** interface for inbound Lightning connections, and an optional **Watchtower** server. StartOS manages the wallet lifecycle — creation, password storage, and auto-unlock on every start — so you never run `lncli create` or `lncli unlock`. It runs on the **SQLite** database backend, Lightning Labs' recommended modern backend.

## Getting set up

LND posts two critical tasks on install; you can't start it until both are done:

1. **Initialize Wallet** — **Start Fresh** for a new wallet, or **Migrate from Umbrel** / **Migrate from myNode** / **Migrate from StartOS** to import one from a node on your local network. Start Fresh shows your 24-word seed **once** — write it down. **The seed alone is not enough:** it recovers _on-chain_ funds only; funds in channels can be recovered only from the **Static Channel Backup** in your StartOS backups, so keep backups (see [Backups](#backups)). Choosing a migration option checks that your address and password reach the origin node and schedules the migration; the migration itself runs **when you start LND** — it shuts the origin down, copies its data, and converts the database before LND comes online, which can take hours on a large node. Watch it under **Health Checks**. If the migration fails repeatedly, LND stops itself and re-posts the **Initialize Wallet** task — run it again to correct the address or password and retry. Once the migration has finished, **never start LND on the origin device again** — two nodes sharing one seed loses funds. The full walkthrough is in the [LND migration guide](https://docs.start9.com/bitcoin-guides/lnd-migration).
2. **Bitcoin Backend** — **Bitcoin** (recommended if you run it on this server) or **Neutrino** (built-in light client). Choosing Bitcoin posts a task on it to enable ZMQ.

Then start LND. A third, non-blocking task suggests setting up **Configure Channel Backups** (see [Backups](#backups)); you can do that at any time.

On every start, **Network and Graph Sync** goes through _Syncing to graph_ before it reaches _Synced_ — usually well under three minutes. If it reads _Waiting for peers_, LND has not connected to any yet. LND depends on a single peer it picks at startup to hand over the channel graph, and if that peer stops responding the sync waits on it; the check then tells you how long it has been pending. LND retries with a different peer within the hour on its own, so this normally clears itself. If you would rather not wait, restart LND — it picks a different peer. A node with no channels sees this most often, because it has no regular peers to reconnect to.

**Wallet Unlock** reports errors from LND's normal wallet unlock request while the wallet remains locked. A refused stored password is identified separately from other errors. Unlock attempts continue automatically.

## Using LND

### Connecting wallets and apps

Open the **REST** or **gRPC LND Connect** interface and copy the `lndconnect://` URI (or scan the QR) into your wallet. It embeds your admin macaroon — treat it like a password. These interfaces appear only after the wallet is initialized.

For **REST**, StartOS serves the connection with your server's own certificate, so leave certificate validation **on** in your wallet. Wallets such as Zeus verify it the same way your browser does — over your local network that means having the [StartOS Root CA](https://docs.start9.com/start-os/trust-ca) installed on the device, exactly as for the StartOS dashboard. If you have set up a custom domain with an ACME certificate, wallets trust it with no extra step.

For **gRPC**, LND serves the certificate your server issued it, and the `lndconnect://` URI carries your server's Root CA so your wallet can verify it — nothing to install on the device. The gRPC QR is denser than the REST one; copy the URI instead if your camera can't read it.

### Reachability and networking

Other nodes connect to you over the **Peer** interface; run **Node Info** for your shareable peer URI. Whether others can reach you depends on the addresses your node advertises:

- **Tor** — Tor is a separate marketplace service, not built in. Install and start **Tor**, and LND will route outbound connections through it (on by default; change in **Tor Settings**). To be reachable _inbound_ over Tor, also add an onion service to the **Peer** interface (the interface's **Tor** table, or the Tor service's **Manage Onion Services** action).
- **Clearnet** — set a **Custom External Host** (e.g. a Tunnelsats or VPN endpoint) to advertise a clearnet address alongside any onion. A public domain on the Peer interface also works, but only with **Skip for clearnet peers** enabled in **Tor Settings**.
- If no address is advertised, the **Node Reachability** health check shows _disabled_: you can still open channels outbound, but others can't open channels to you.

### Configuration

Configure LND through its settings actions — General, Routing Fees, Channel Settings, Autopilot, Performance, Watchtower Server/Client, Bitcoin Backend, Tor, and Custom External Host. You can also edit `lnd.conf` directly: your settings are preserved across restarts, except for a few keys StartOS manages for you (`externalip`/`externalhosts`, `tor.socks`, and the Bitcoin backend connection settings).

**Not routing any payments?** Check **Reject Routing Requests** under **Channel Settings**. With it on, LND still sends and receives payments but refuses to be used as a hop, and the log shows `node configured to disallow forwards` each time it turns one away.

Two advanced actions worth knowing: **Reset Wallet Transactions** rescans the chain for on-chain transactions LND may have missed; **Revoke Macaroons** revokes every existing macaroon and mints fresh ones, after which you must reconnect wallets with the new `lndconnect://` URI.

Run **Revoke Macaroons** if a macaroon may have been copied or exposed — for example if you run BTCPay Server, which reads LND's admin macaroon and shipped an actively exploited vulnerability in versions before 2.4.2. Every other service connected to LND also loses access until it picks up the new macaroon, so expect to restart them.

## Backups

StartOS backs up LND with its system backup. **For a Lightning node this is essential:** your seed recovers on-chain funds only, while channel funds can be recovered only by force-closing from LND's **Static Channel Backup**, which is included in StartOS backups. Back up regularly.

### Keeping the channel backup current

A StartOS backup holds the channel backup as it was the moment you took it. Open a channel afterwards and that channel is missing from it, so its funds are not recovered.

**Configure Channel Backups** closes that gap. Pick any combination of Google Drive, Dropbox, Nextcloud and SFTP, and a copy is sent there every time your channels change. The agent publishes the current copy under the stable name `channel.backup` on each provider. The backup is encrypted by LND with a key derived from your seed. Prefer somewhere you control, and use two targets if you can. A copy on this same server dies with it, so choose another machine. Only loopback addresses can be detected and refused; a folder elsewhere on the same disk cannot be told apart from a real target.

Google Drive and Dropbox need approving in a browser: fill in the client credentials and submit once to get a link, approve it, then paste the code it gives you back into the form and submit again. For Nextcloud, use an app password from **Settings → Security** and an `https://` address. For SFTP, either a password or an SSH private key without a passphrase works. Saving records the server's host key and shows its fingerprint; compare it with your server, then save again with **Host key verified** turned on. Nothing is sent to the server until you do. Turning a target off keeps its settings; turn it off and select **Forget saved credentials** to remove them.

Once your first channel has opened and LND has created its Static Channel Backup, run **Back Up Channels Now**. It reports what each target said, so you find a typo immediately rather than at restore time. The **Channel Backup** health check then shows how long ago every enabled target last succeeded, and names any target that starts failing.

### Restoring from backup

A StartOS restore stages the Static Channel Backup carried inside that StartOS backup before LND starts. LND then asks each peer in that file to force-close and shows a persistent warning. The package does not scan storage providers or automatically restore their copies. It disables every off-server target during restore so the older local copy cannot replace a newer provider copy. Retrieve the newest copy you need before enabling targets again, then restore it following LND or Start9 support guidance. **Lightning Labs strongly recommends against continued use of a restored node:** once funds are back on-chain, sweep them to another wallet, then uninstall and reinstall LND fresh.

## Limitations

- **Mainnet only** — no testnet, signet, or regtest.
- **Wallet is managed by StartOS** — `lncli create` and `lncli unlock` are not used.
