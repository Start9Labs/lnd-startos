# LND

## Documentation

- [Start9 Lightning wallets guide](https://docs.start9.com/bitcoin-guides/lightning-wallets) — how to connect popular Lightning wallets to a StartOS node.
- [LND operator documentation](https://docs.lightning.engineering/lightning-network-tools/lnd) — the upstream guide to running, configuring, and using LND.

## What you get on StartOS

- A full **LND** Lightning Network node running on Bitcoin mainnet, with Tor enabled by default.
- **REST LND Connect** and **gRPC LND Connect** interfaces exporting `lndconnect://` URIs (with embedded macaroon and cert) for plugging LND into wallets and apps.
- A **Peer Interface** for inbound Lightning connections from other nodes.
- A **Watchtower** interface for letting other nodes use this node as their watchtower, available once the watchtower server is enabled.
- Wallet lifecycle (create, password storage, auto-unlock) is handled by StartOS — you never run `lncli create` or `lncli unlock`.

## Getting set up

LND posts two critical tasks after install. You can't start the service until both are done.

1. Run the **Initialize Wallet** task. Choose **Start Fresh** to create a new wallet, **Migrate from Umbrel** to import from an Umbrel 1.x node, or **Migrate from StartOS** to import from another StartOS server. On Start Fresh, LND displays your 24-word Aezeed cipher seed **once** — write it down and store it somewhere safe before dismissing. The seed restores on-chain funds only; it does not back up channel state. This is not a BIP-39 seed and only works with LND.
2. Run the **Bitcoin Backend** task and choose **Bitcoin Core** (recommended if you run Bitcoin Core on this server) or **Neutrino** (built-in light client, no Bitcoin dependency). Selecting Bitcoin Core will post a critical task on Bitcoin Core to enable ZMQ.
3. Start LND. Your wallet is unlocked automatically on every start.

## Using LND

### Connecting wallets and apps

Open the **REST LND Connect** or **gRPC LND Connect** interface and copy the `lndconnect://` URI (or scan the QR code) into your wallet or app. The URI carries the admin macaroon and the self-signed TLS certificate; treat it like a password. The REST and gRPC interfaces only appear once the wallet has been initialized.

### Peer connections

Other Lightning nodes connect to you over the **Peer Interface**. To share your node's peer URI, run the **Node Info** action.

### Configuration

LND is configured through actions rather than by editing `lnd.conf` directly. Every action writes to `lnd.conf` and takes effect on the next start (or immediately, where LND supports it).

- **General Settings** — node alias, color, accept keysend, accept AMP, and Tor controls. **Route outbound through Tor** (on by default) sends LND's outbound peer connections through the Tor SOCKS proxy; turn it off for clearnet-first outbound or if Tor is interfering with wallet sync. **Use Tor for all traffic** further forces Tor for clearnet-reachable peers and only applies when outbound Tor is on. Inbound peers always reach this node via the StartOS-managed Tor hidden service.
- **Routing Fees** — base fee, fee rate, and CLTV delta for forwarded payments.
- **Channel Settings** — default confirmations, min/max channel size, wumbo, zero-conf, SCID alias, pending-channel limit, circular routes, reject-push, and cooperative-close target.
- **Autopilot Settings** — enable automatic channel management and set max channels, allocation, channel size, privacy, and confirmation targets.
- **Performance** — database auto-compact, invoice GC, reconnect stagger, gossip and graph-pruning settings.
- **Watchtower Server** — enable the watchtower server and select which of this node's watchtower addresses to advertise. With it enabled, the **Watchtower Server Info** action becomes available.
- **Watchtower Client Settings** — enable the watchtower client and add tower URIs (`pubkey@host:9911`).

### Actions

- **Node Info** — display the node alias, public key, and peer URI(s); shareable with other operators who want to open a channel with you.
- **Watchtower Server Info** — display this node's tower URI for sharing with peers; available once the watchtower server is enabled.
- **Reset Wallet Transactions** — rescan on-chain transactions from the wallet birthday. Use this if LND has missed an on-chain transaction. LND restarts to apply the reset.
- **Recreate Macaroons** — delete every macaroon and regenerate them on next start. Use this if a macaroon has been leaked or to rotate credentials. Any wallet or service currently using an old macaroon will need to be reconnected with the new `lndconnect://` URI afterwards.

### Restoring from backup

If you restore LND from a StartOS backup, LND automatically requests force-close of every channel from the Static Channel Backup, and a persistent health-check warning is shown. **Lightning Labs strongly recommends against continued use of a restored LND node.** Once funds are back on-chain, sweep them to another wallet, uninstall LND, and reinstall fresh.

## Limitations

- **Mainnet only.** Testnet, signet, and regtest are not available.
- **No manual wallet management.** `lncli create` and `lncli unlock` are not used — StartOS handles wallet creation and unlocking. Direct edits to `lnd.conf` are overwritten by the configuration actions.
