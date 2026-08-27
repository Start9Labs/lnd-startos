# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

**Start every task at the recipe index** — `../start-technologies/projects/start-sdk/docs/src/recipes.md`
(or <https://docs.start9.com/packaging/recipes.html>). It maps an intent ("prompt the user to create
admin credentials", "expose a web UI") to the constructs, the reference pages, and a named production
package to copy. Find the recipe before you read this package's neighbours: a package you reach by
grepping may be non-conformant, and the recipe outranks it.

Freshly scaffolded? Work the
[New Package Checklist](../start-technologies/projects/start-sdk/docs/src/new-package-checklist.md)
(or <https://docs.start9.com/packaging/new-package-checklist.html>) from top to bottom. It is a
guide page, not a file in this repo — read it, don't copy it in.

Keep `README.md` (technical reference for an AI support or administering agent) and
`instructions.md` (end-user docs) in sync with your changes.

**Bugs and feature requests are GitHub issues on this repo** — file them as you find them.
Don't record work in the repo instead: no `TODO.md`, no `NOTES.md`, no `PLAN.md`. What you
verified, tried, and decided belongs in the commit message and the PR body.

## This repo

- **One-time flags belong in `startup-flags.json`, never in `store.json`.** `main` reads the store under a `.const` watch that restarts the service on any change, so clearing a consumed flag there loops. The flags file is read with `.once`, and **each flag is cleared by the same oneshot that consumed it** — never by a dependent one, whose write a restart can preempt, leaving a one-time flag armed on every start after.
- **`main` restarts on any `tls.cert` change, so the certificate's address set must come off the binding, never an exported interface.** An interface carries only a view of the binding's addresses and disappears with it; `utils.filledAddress(host, { internalPort })` reads the same list keyed on the binding, which lives as long as the port is bound.
- **`db.use-native-sql` goes on the daemon's CLI, never in the conf.** The conversion's schema-finalize run reads the same conf in bolt mode and bolt rejects native SQL, and LND's flag parser cannot turn a conf-level bool back off from the command line.
- **`db.backend` is enforced, not optional, so the migration never has to write it** — a write would trip `main`'s `lnd.conf` watch and restart the service mid-conversion.
- **`sync-progress` must keep returning `loading` while the graph sync is pending, never `failure`.** `albyhub`, `mempool`, `helipad`, `mostro` and `fedimint-gateway` all name this check in their dependency `healthChecks`, so a different result silently changes gating for five packages. Report the stall in the message instead — that is why the branch carries peer count and elapsed time rather than a worse result.
- **Nothing over RPC identifies the elected historical syncer** — in the wedged state every peer reports `PASSIVE_SYNC` — and a large legitimate backfill looks the same through `getinfo`. That rules out an auto-heal watchdog: a timer-triggered disconnect or restart would kill real progress and could loop without converging.
- **Don't re-enable `healthcheck.chainbackend.attempts` expecting a safety net.** The check issues `uptime` and counts outbound peers, never fetching a block, so it stays green against a backend that serves headers but not blocks — the failure in bitcoin-core-startos#270. Exhausting it only logs at Critical; it does not stop LND.
- **The onion-message protocol keys must stay forced to `undefined`.** LND 0.21 advertises feature bit 39 natively, and a carried-over `custom-init`/`nodeann` override makes it abort server creation and crash-loop.
- **LND's self-calls use loopback, not the bridge.** The bridge answers REST with the proxy's device certificate, which fails the `tls.cert` pin.
- **Read the pending import inside the oneshot's `fn`, not in the chain builder.** The reconciler's config hash cannot see closures, so re-reading is what lets corrected credentials take effect without tearing down a running daemon.
