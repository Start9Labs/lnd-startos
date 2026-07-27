# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

Work this package's `TODO.md` from top to bottom. Keep `README.md` (architecture, for developers and LLMs) and `instructions.md` (end-user docs) in sync with your changes.

## This repo

- **Dependency dials go through the LXC bridge** — bitcoind's RPC and ZMQ, and tor's SOCKS — resolved with `sdk.host.getBridgeAddress` keyed by **host id** (`sdk.MultiHost.of`'s arg — the `*HostId` consts, which differ from the interface id for some: bitcoind's `zmq-block`/`zmq-tx` both live on host `zmq`). It resolves each binding's own derived bridge address, never `net.assignedPort`/`assignedSslPort` — which of those are populated is a property of how the dependency bound the port: `assignedSslPort` holds a port that speaks TLS whether StartOS terminates it (`addSsl`) or the container does (`secure: {ssl: true}` passthrough), `assignedPort` a plaintext one, so an `http` binding has both and a TLS binding of either kind has only `assignedSslPort`. `.const()` restarts main only on the dep's install/uninstall/address-change and self-heals when the dep appears; a plain dep update is zero restarts. Pass `ssl: false` for bitcoind's RPC, which publishes both a plaintext and a TLS bridge address; the ZMQ bindings publish one each and need no discriminator. `fallbackPort` (tor's `9050`) keeps the value non-null so the flag is always set and Tor churn never restarts LND. Import bitcoind's host-ids and ports (`rpcPort`, `zmqPortBlock`, `zmqPortTransaction`) from `bitcoin-core-startos/startos/utils`, and tor's `socksHostId`/`socksPort` from `tor-startos/startos/utils` (both declared deps), never hardcoded.
- **LND's calls against itself use loopback, not the bridge** — `selfRestUrl` / `selfGrpcHost` in `startos/utils.ts` are plain `127.0.0.1` constants. REST's bridge address is the StartOS reverse proxy, which answers with the device certificate and would fail the `tls.cert` pin the health checks, wallet unlock and `lncli` use; subcontainers share the service's network namespace, so loopback reaches the daemon directly. Package id is `lnd`.

## Inspecting a running install

`start-cli package attach lnd -n <subcontainer-name> -- <cmd>` — select the subcontainer by **name** with `-n` (the name passed to `SubContainer.of` in `main.ts`). `-s` matches the internal Guid, not the name.
