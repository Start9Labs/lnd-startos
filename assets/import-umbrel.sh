#!/bin/sh

set -e
set -o pipefail

UMBREL_USER="umbrel"
UMBREL_LND_DIR="/home/umbrel/umbrel/app-data/lightning/data/lnd"

export SSHPASS="$UMBREL_PASS"

# umbrel's sudo wants the same password as SSH. Feeding it over the remote
# command's stdin (-S) keeps it out of both the command string and the remote
# process list.
umbrel_sudo() {
  printf '%s\n' "$UMBREL_PASS" |
    sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T "${UMBREL_USER}@${UMBREL_HOST}" "sudo -S $1"
}

>&2 echo "Stopping Umbrel services"

umbrel_sudo "systemctl stop umbrel" >&2

>&2 echo "Copying LND data"

# Only data/ — lnd.conf and the TLS pair are StartOS's to generate. -o drops
# the origin's ownership on the way in.
umbrel_sudo "tar -cf - -C ${UMBREL_LND_DIR} data" | tar -xof - -C /root/.lnd/

if [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/wallet.db ]; then
  >&2 echo "No wallet.db in the copied data — is Lightning set up on this Umbrel?"
  exit 1
fi

>&2 echo "Writing wallet password"

echo '{"walletPassword":"moneyprintergobrrr"}' > /tmp/old-store.json
