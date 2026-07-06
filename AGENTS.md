# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

Work this package's `TODO.md` from top to bottom. Keep `README.md` (architecture, for developers and LLMs) and `instructions.md` (end-user docs) in sync with your changes.

## This repo

- **Reaching bitcoind and its own interfaces goes through the LXC bridge**, not `.startos` DNS or container IPs. Two resolution helpers live in `startos/utils.ts`, both looking up by **host id** (`sdk.MultiHost.of`'s arg — the `*HostId` consts, which differ from the interface id for some interfaces: `lnd-connect-rest` lives on host `control`; bitcoind's `zmq-block`/`zmq-tx` both live on host `zmq`):
  - **Dependency dials** (bitcoind RPC, tor SOCKS) use `bridgeAddress` — the doctrine-v3 helper. Its map reads `host.bindings[internalPort].net.assignedPort` and prefixes `sdk.getOsIp` (the OS bridge IP, `10.0.3.1`), **never** `addressInfo` hostnames (those go empty when a binding is disabled and cause spurious `.const()` flaps). `.const()` therefore restarts main only on the dep's install/uninstall/port-change and self-heals when the dep appears; a plain dep update is zero restarts. `fallbackPort` (tor's `9050`) keeps the value non-null so the flag is always set and Tor churn never restarts LND. Import bitcoind's host-ids and ports (`rpcPort`, `zmqPortBlock`, `zmqPortTransaction`) from `bitcoin-core-startos/startos/utils`, and tor's `socksHostId`/`socksPort` from `tor-startos/startos/utils` (both declared deps), never hardcoded.
  - **Own interfaces** (LND's REST/gRPC for its self-calls) use the older `bridgeAddr` helper via `sdk.host.getOwn`, pulling the bridge `host:port` off `addressInfo` inside the map fn.
- **Keep subscriptions minimal.** One `sdk.host` call per *host*, not per interface — `getBitcoindBundle` reads bitcoind's `zmq` host once and derives both `zmq-block` and `zmq-tx` addresses (as a `{ block, tx }` object; deep-equal keeps it churn-free) in a single map fn. Package id is `lnd`.

## Inspecting a running install

`start-cli package attach lnd -n <subcontainer-name> -- <cmd>` — select the subcontainer by **name** with `-n` (the name passed to `SubContainer.of` in `main.ts`). `-s` matches the internal Guid, not the name.
