#!/bin/sh
# Import LND data from an Umbrel over the LAN. Runs inside the lnd image
# (openssh-client + sshpass come from the Dockerfile) with the main volume at
# /root/.lnd. Contract with actions/initializeWallet.ts: exit 0 with the old
# node's store fragment at /tmp/old-store.json, non-zero with the reason on
# stderr.

set -eu

# sshpass -e reads the password from SSHPASS, keeping it out of argv (visible
# in `ps` to every process in the container while ssh runs) and immune to
# quoting problems. UserKnownHostsFile=/dev/null keeps a retry working after
# the origin was reinstalled and its host key changed.
export SSHPASS="$UMBREL_PASS"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

>&2 echo "Stopping Umbrel services"
# umbrel's sudo wants the password on stdin (-S); ssh -T forwards our stdin.
printf '%s\n' "$UMBREL_PASS" | sshpass -e ssh $SSH_OPTS -T "umbrel@$UMBREL_HOST" \
  'sudo -S -p "" systemctl stop umbrel'

# Copying a live bolt database yields a corrupt copy, and stopping the umbrel
# unit does not visibly guarantee the Lightning app's container is down — so
# gate on the daemon actually being gone rather than on the stop returning.
# LND runs in a Docker container whose processes the host's /proc still lists,
# so pgrep here sees it. pgrep exits 1 when nothing matched; ssh exits 255 if
# the connection failed, and treating that as "stopped" would wave us through
# to copying a live database, so only 1 ends the wait.
>&2 echo "Waiting for LND to shut down"
tries=0
while true; do
  status=0
  sshpass -e ssh $SSH_OPTS -T "umbrel@$UMBREL_HOST" 'pgrep -x lnd' < /dev/null \
    > /dev/null || status=$?
  case "$status" in
    0) ;; # still running
    1) break ;; # no match — LND is down
    *)
      >&2 echo "Could not check whether LND stopped on the Umbrel (exit $status) — aborting rather than copying a possibly live database"
      exit 1
      ;;
  esac
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    >&2 echo "LND did not stop on the Umbrel after 2 minutes — aborting before copying a live database"
    exit 1
  fi
  sleep 2
done

>&2 echo "Copying LND data"
# Only the data/ subtree: wallet, channel state, and macaroons. Umbrel's
# lnd.conf and TLS keypair must NOT come along — the conf is managed by this
# package, and LND won't regenerate a TLS cert that exists, so the origin's
# cert (wrong SANs) would be served to every gRPC client. rm first so a retry
# after a partial copy doesn't nest data/data.
rm -rf /root/.lnd/data
sshpass -e scp $SSH_OPTS -r \
  "umbrel@$UMBREL_HOST:/home/umbrel/umbrel/app-data/lightning/data/lnd/data" \
  /root/.lnd/

if [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/wallet.db ]; then
  >&2 echo "Copy finished but no wallet.db at data/chain/bitcoin/mainnet — is the Lightning app installed and set up on this Umbrel?"
  exit 1
fi

>&2 echo "Writing wallet password"
# Umbrel's Lightning app initializes every LND wallet with this fixed password.
printf '{"walletPassword":"moneyprintergobrrr"}' > /tmp/old-store.json
