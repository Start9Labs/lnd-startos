# LND

## Documentation

- [Start9 Lightning wallets guide](https://docs.start9.com/bitcoin-guides/lightning-wallets) — connecting popular Lightning wallets to a StartOS node.
- [LND operator documentation](https://docs.lightning.engineering/lightning-network-tools/lnd) — the upstream guide to running and configuring LND.

## What you get on StartOS

A full **LND** node on Bitcoin mainnet, with **REST** and **gRPC** LND Connect interfaces, a **Peer** interface for inbound Lightning connections, and an optional **Watchtower** server. StartOS manages the wallet lifecycle — creation, password storage, and auto-unlock on every start — so you never run `lncli create` or `lncli unlock`. It runs on the **SQLite** database backend, Lightning Labs' recommended modern backend.

## Getting set up

LND posts two critical tasks on install; you can't start it until both are done:

1. **Initialize Wallet** — **Start Fresh** for a new wallet, or **Migrate from Umbrel** / **Migrate from myNode** / **Migrate from StartOS** to import one from a node on your local network. Start Fresh shows your 24-word seed **once** — write it down. **The seed alone is not enough:** it recovers _on-chain_ funds only; funds in channels can be recovered only from the **Static Channel Backup** in your StartOS backups, so keep backups (see [Backups](#backups)). Choosing a migration option checks that your address and password reach the origin node and schedules the migration; the migration itself runs **when you start LND** — it shuts the origin down, copies its data, and converts the database before LND comes online, which can take hours on a large node. Watch it under **Health Checks**. If the migration fails repeatedly, LND stops itself and re-posts the **Initialize Wallet** task — run it again to correct the address or password and retry. Once the migration has finished, **never start LND on the origin device again** — two nodes sharing one seed loses funds. The full walkthrough is in the [LND migration guide](https://docs.start9.com/bitcoin-guides/lnd-migration).
2. **Bitcoin Backend** — **Bitcoin** (recommended if you run it on this server) or **Neutrino** (built-in light client). Choosing Bitcoin posts a task on it to enable ZMQ.

Then start LND.

On every start, **Network and Graph Sync** goes through _Syncing to graph_ before it reaches _Synced_ — usually well under three minutes. The check shows how many peers you are connected to while it works. LND depends on a single peer it picks at startup to hand over the channel graph, and if that peer stops responding the sync waits on it; the check then tells you how long it has been pending. LND retries with a different peer within the hour on its own, so this normally clears itself. If you would rather not wait, restart LND — it picks a different peer. A node with no channels sees this most often, because it has no regular peers to reconnect to.

## Using LND

### Connecting wallets and apps

Open the **REST** or **gRPC LND Connect** interface and copy the `lndconnect://` URI (or scan the QR) into your wallet. It embeds your admin macaroon — treat it like a password. These interfaces appear only after the wallet is initialized.

For **REST**, StartOS serves the connection with your server's own certificate, so leave certificate validation **on** in your wallet. Wallets such as Zeus verify it the same way your browser does — over your local network that means having the [StartOS Root CA](https://docs.start9.com/start-os/trust-ca) installed on the device, exactly as for the StartOS dashboard. If you have set up a custom domain with an ACME certificate, wallets trust it with no extra step.

For **gRPC**, LND serves its own certificate, which the `lndconnect://` URI carries so your client can verify it. That makes the gRPC URI much longer, so prefer copying it over scanning the QR.

### Reachability and networking

Other nodes connect to you over the **Peer** interface; run **Node Info** for your shareable peer URI. Whether others can reach you depends on the addresses your node advertises:

- **Tor** — Tor is a separate marketplace service, not built in. Install and start **Tor**, and LND will route outbound connections through it (on by default; change in **Tor Settings**). To be reachable _inbound_ over Tor, also add an onion service to the **Peer** interface (the interface's **Tor** table, or the Tor service's **Manage Onion Services** action).
- **Clearnet** — set a **Custom External Host** (e.g. a Tunnelsats or VPN endpoint) to advertise a clearnet address alongside any onion. A public domain on the Peer interface also works, but only with **Skip for clearnet peers** enabled in **Tor Settings**.
- If no address is advertised, the **Node Reachability** health check shows _disabled_: you can still open channels outbound, but others can't open channels to you.

### Configuration

Configure LND through its settings actions — General, Routing Fees, Channel Settings, Autopilot, Performance, Watchtower Server/Client, Bitcoin Backend, Tor, and Custom External Host. You can also edit `lnd.conf` directly: your settings are preserved across restarts, except for a few keys StartOS manages for you (`externalip`/`externalhosts`, `tor.socks`, and the Bitcoin backend connection settings).

Two advanced actions worth knowing: **Reset Wallet Transactions** rescans the chain for on-chain transactions LND may have missed; **Revoke Macaroons** revokes every existing macaroon and mints fresh ones, after which you must reconnect wallets with the new `lndconnect://` URI.

Run **Revoke Macaroons** if a macaroon may have been copied or exposed — for example if you run BTCPay Server, which reads LND's admin macaroon and shipped an actively exploited vulnerability in versions before 2.4.2. Every other service connected to LND also loses access until it picks up the new macaroon, so expect to restart them.

## Backups

StartOS backs up LND with its system backup. **For a Lightning node this is essential:** your seed recovers on-chain funds only, while channel funds can be recovered only by force-closing from LND's **Static Channel Backup**, which is included in StartOS backups. Back up regularly.

### Restoring from backup

Restoring force-closes every channel from the Static Channel Backup and shows a persistent warning. **Lightning Labs strongly recommends against continued use of a restored node:** once funds are back on-chain, sweep them to another wallet, then uninstall and reinstall LND fresh.

## Limitations

- **Mainnet only** — no testnet, signet, or regtest.
- **Wallet is managed by StartOS** — `lncli create` and `lncli unlock` are not used.
