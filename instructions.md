# LND

## Documentation

- [Start9 Lightning wallets guide](https://docs.start9.com/bitcoin-guides/lightning-wallets) — connecting popular Lightning wallets to a StartOS node.
- [LND operator documentation](https://docs.lightning.engineering/lightning-network-tools/lnd) — the upstream guide to running and configuring LND.

## What you get on StartOS

A full **LND** node on Bitcoin mainnet, with **REST** and **gRPC** LND Connect interfaces, a **Peer** interface for inbound Lightning connections, and an optional **Watchtower** server. StartOS manages the wallet lifecycle — creation, password storage, and auto-unlock on every start — so you never run `lncli create` or `lncli unlock`.

## Getting set up

LND posts two critical tasks on install; you can't start it until both are done:

1. **Initialize Wallet** — **Start Fresh** for a new wallet, or **Migrate from Umbrel** / **Migrate from StartOS** to import one. Start Fresh shows your 24-word seed **once** — write it down. **The seed alone is not enough:** it recovers *on-chain* funds only; funds in channels can be recovered only from the **Static Channel Backup** in your StartOS backups, so keep backups (see [Backups](#backups)).
2. **Bitcoin Backend** — **Bitcoin Core** (recommended if you run it on this server) or **Neutrino** (built-in light client). Choosing Bitcoin Core posts a task on it to enable ZMQ.

Then start LND.

## Using LND

### Connecting wallets and apps

Open the **REST** or **gRPC LND Connect** interface and copy the `lndconnect://` URI (or scan the QR) into your wallet. It embeds your admin macaroon — treat it like a password. These interfaces appear only after the wallet is initialized.

### Reachability and networking

Other nodes connect to you over the **Peer** interface; run **Node Info** for your shareable peer URI. Whether others can reach you depends on the addresses your node advertises:

- **Tor** — Tor is a separate marketplace service, not built in. Install and start **Tor**, and LND will route outbound connections through it (on by default; change in **Tor Settings**). To be reachable *inbound* over Tor, also add an onion service to the **Peer** interface (the interface's **Tor** table, or the Tor service's **Manage Onion Services** action).
- **Clearnet** — set a **Custom External Host** (e.g. a Tunnelsats or VPN endpoint) to advertise a clearnet address alongside any onion. A public domain on the Peer interface also works, but only with **Skip for clearnet peers** enabled in **Tor Settings**.
- If no address is advertised, the **Node Reachability** health check shows *disabled*: you can still open channels outbound, but others can't open channels to you.

### Configuration

Configure LND through its settings actions — General, Routing Fees, Channel Settings, Autopilot, Performance, Watchtower Server/Client, Bitcoin Backend, Tor, and Custom External Host. You can also edit `lnd.conf` directly: your settings are preserved across restarts, except for a few keys StartOS manages for you (`externalip`/`externalhosts`, `tor.socks`, and the Bitcoin backend connection settings).

Two advanced actions worth knowing: **Reset Wallet Transactions** rescans the chain for on-chain transactions LND may have missed; **Recreate Macaroons** rotates credentials, after which you must reconnect wallets with the new `lndconnect://` URI.

## Backups

StartOS backs up LND with its system backup. **For a Lightning node this is essential:** your seed recovers on-chain funds only, while channel funds can be recovered only by force-closing from LND's **Static Channel Backup**, which is included in StartOS backups. Back up regularly.

### Restoring from backup

Restoring force-closes every channel from the Static Channel Backup and shows a persistent warning. **Lightning Labs strongly recommends against continued use of a restored node:** once funds are back on-chain, sweep them to another wallet, then uninstall and reinstall LND fresh.

## Limitations

- **Mainnet only** — no testnet, signet, or regtest.
- **Wallet is managed by StartOS** — `lncli create` and `lncli unlock` are not used.
