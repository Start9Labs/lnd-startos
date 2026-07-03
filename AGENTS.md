# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

Work this package's `TODO.md` from top to bottom. Keep `README.md` (architecture, for developers and LLMs) and `instructions.md` (end-user docs) in sync with your changes.

## This repo

- **Reaching bitcoind and its own interfaces goes through the LXC bridge**, not `.startos` DNS or container IPs. Resolve addresses with `sdk.host.getOwn`/`get` passing a **map fn** — the `bridgeAddr` helper in `startos/utils.ts` runs *inside* that map fn to pull one interface's bridge `host:port` off an already-resolved `Host`, so `.const()` reacts only to the address, not to unrelated host churn. Look up by **host id** (`sdk.MultiHost.of`'s arg — the `*HostId` consts in `interfaces.ts`), which differs from the interface id for some interfaces (e.g. `lnd-connect-rest` lives on host `control`; bitcoind's `zmq-block`/`zmq-tx` both live on host `zmq`). Bitcoind's ids are imported from `bitcoin-core-startos/startos/utils` (a declared dependency), not hardcoded.
- **Keep subscriptions minimal.** One `sdk.host` call per *host*, not per interface — `getBitcoindBundle` reads bitcoind's `zmq` host once and derives both `zmq-block` and `zmq-tx` addresses in a single map fn. Package id is `lnd`.

## Inspecting a running install

`start-cli package attach lnd -n <subcontainer-name> -- <cmd>` — select the subcontainer by **name** with `-n` (the name passed to `SubContainer.of` in `main.ts`). `-s` matches the internal Guid, not the name.
