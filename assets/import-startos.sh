#!/bin/sh
# Import LND from another StartOS server (0.4.x running this 2.x package) over
# the LAN. Runs inside the lnd image (openssh-client + sshpass come from the
# Dockerfile) with the main volume at /root/.lnd. Contract with
# actions/initializeWallet.ts: exit 0 with the origin's store.json at
# /tmp/old-store.json, non-zero with the reason on stderr.
#
# Why ssh as start9 with the master password works: the OS writes the master
# password's hash onto the start9 system user at first dashboard login
# (start-core auth.rs write_shadow). start9 is a NOPASSWD sudoer, and start-cli
# on the box auths through /run/startos/rpc.authcookie (group startos), so
# neither needs the password again.

set -eu

STARTOS_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"

# sshpass -e reads the password from SSHPASS, keeping it out of argv and
# immune to quoting problems (the old eval-based version broke on any special
# character in the master password). UserKnownHostsFile=/dev/null keeps a
# retry working after the origin was reinstalled and its host key changed.
export SSHPASS="$STARTOS_PASS"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

run_remote() {
  sshpass -e ssh $SSH_OPTS -T "start9@$STARTOS_HOST" "$@" < /dev/null
}

>&2 echo "Stopping LND on the origin server"
# Tolerate failure here (LND may already be stopped); the wait below is the
# actual safety gate.
run_remote "start-cli package stop lnd" \
  || >&2 echo "stop command failed (LND may already be stopped) — continuing"

# Copying a live bolt database yields a corrupt copy. `stop` only requests the
# shutdown, so wait until the daemon has actually exited. A service container
# gets its own PID namespace, but namespaces nest downward — the host's /proc
# still lists the process — so pgrep on the origin sees LND inside its runtime.
#
# Distinguish "not running" from "couldn't ask": pgrep exits 1 when nothing
# matched, while ssh exits 255 if the connection itself failed. Treating any
# non-zero as "stopped" would let a network blip wave us through to copying a
# live database, so only 1 ends the wait.
>&2 echo "Waiting for LND to shut down"
tries=0
while true; do
  status=0
  run_remote "pgrep -x lnd" > /dev/null || status=$?
  case "$status" in
    0) ;; # still running
    1) break ;; # no match — LND is down
    *)
      >&2 echo "Could not check whether LND stopped on the origin server (exit $status) — aborting rather than copying a possibly live database"
      exit 1
      ;;
  esac
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    >&2 echo "LND did not stop on the origin server after 2 minutes — aborting before copying a live database"
    exit 1
  fi
  sleep 2
done

>&2 echo "Copying LND data"
# Only data/ (wallet, channel state, macaroons) — the origin's lnd.conf,
# store.json and TLS material stay behind. rm first so a retry after a partial
# copy starts clean.
rm -rf /root/.lnd/data
run_remote "sudo tar -cf - -C $STARTOS_LND_VOLUME data" | tar -xf - -C /root/.lnd/

if [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/wallet.db ]; then
  >&2 echo "Copy finished but no wallet.db was found — has a wallet been initialized on the origin server?"
  exit 1
fi

>&2 echo "Extracting wallet password"
run_remote "sudo cat $STARTOS_LND_VOLUME/store.json" > /tmp/old-store.json

>&2 echo "Uninstalling LND from the origin server"
# Deliberate: prevents the old node from ever broadcasting stale channel state.
run_remote "start-cli package uninstall lnd"
