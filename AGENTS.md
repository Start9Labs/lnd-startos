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
`instructions.md` (end-user docs) in sync with your changes. This file restates neither:
whoever changes the package has both, so it carries only what they don't — repo mechanics,
a change that looks right and is not, where the next thing gets added, a naming trap, a
build or test invocation particular to this repo.

**Fix a defect you spot rather than reporting it** — you have the package open and the
context to be sure. File **a GitHub issue on this repo** only when the call isn't yours to
make: you can't pin the cause down, two defensible fixes exist, or it's too large to ride on
the work in hand. An open issue is a report, not a queue — implement one when you're asked
to or when it's labelled `Approved`, then close it with `Closes #<n>`.

Don't record work in the repo instead: no `TODO.md`, no `NOTES.md`, no `PLAN.md`. What you
verified, tried, and decided belongs in the commit message and the PR body.

## This repo

- **One-time flags go in `startup-flags.json`, never `store.json`**: `main` restarts on any store change, so clearing a consumed flag there loops. Clear each flag in the oneshot that consumed it, never a dependent one a restart can preempt.
- **Take the `tls.cert` address set from the binding (`utils.filledAddress(host, { internalPort })`), never an exported interface**: `main` restarts on any certificate change, and an interface disappears with its binding.
- **Put `db.use-native-sql` on the daemon's CLI, never in the conf**: the conversion's bolt schema-finalize run reads the same conf and bolt rejects it.
- **Keep `db.backend` enforced in the shape, not optional**: the migration must never write it, since a write trips `main`'s `lnd.conf` watch mid-conversion.
- **`sync-progress` must keep returning `loading` while the graph sync is pending, never `failure`**: `albyhub`, `mempool`, `helipad`, `mostro` and `fedimint-gateway` gate on it. Report a stall in the message.
- **Don't add an auto-heal watchdog for a stalled graph sync**: nothing over RPC tells the wedged state from a large legitimate backfill, so a timed disconnect or restart can kill real progress.
- **Keep `routing.assumechanvalid` set while Bitcoin is pruned, whatever LND's deprecation warning says**: without it graph sync stalls (#210).
- **Don't re-enable `healthcheck.chainbackend.attempts` as a safety net**: it stays green against a backend serving headers but not blocks, and exhausting it only logs.
- **Keep the onion-message protocol keys forced to `undefined`**: a carried-over `custom-init`/`nodeann` override makes LND 0.21 crash-loop.
- **LND's self-calls use loopback, not the bridge**: the bridge answers REST with the proxy's certificate, which fails the `tls.cert` pin.
- **Read the pending import inside the oneshot's `fn`, not in the chain builder**: the reconciler's config hash cannot see closures, so only a re-read picks up corrected credentials.
