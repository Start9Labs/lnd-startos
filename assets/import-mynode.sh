#!/bin/sh

set -e
set -o pipefail

MYNODE_USER="admin"
MYNODE_LND_DIR="/mnt/hdd/mynode/lnd"
MYNODE_PW_FILE="/mnt/hdd/mynode/settings/.lndpw"

export SSHPASS="$MYNODE_PASS"

# admin's sudo wants the same password. Feeding it over the remote command's
# stdin (-S) keeps it out of both the command string and the remote process list.
mynode_sudo() {
  printf '%s\n' "$MYNODE_PASS" |
    sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T "${MYNODE_USER}@${MYNODE_HOST}" "sudo -S $1"
}

>&2 echo "Stopping myNode services"

mynode_sudo /usr/bin/mynode_stop_critical_services.sh >&2

>&2 echo "Copying LND data"

# Only data/ — lnd.conf and the TLS pair are StartOS's to generate. Streaming it
# through tar avoids the recursive chmod that scp'ing as admin would require, and
# -o drops myNode's bitcoin:bitcoin ownership on the way in.
mynode_sudo "tar -cf - -C ${MYNODE_LND_DIR} data" | tar -xof - -C /root/.lnd/

if [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/wallet.db ]; then
  >&2 echo "No wallet.db in the copied data — is LND set up on this myNode?"
  exit 1
fi

>&2 echo "Reading wallet password"

LND_PASS=$(mynode_sudo "cat ${MYNODE_PW_FILE}" | tr -d '\r\n')

if [ -z "$LND_PASS" ]; then
  >&2 echo "myNode's LND wallet password (${MYNODE_PW_FILE}) is missing or empty"
  exit 1
fi

printf '%s' "$LND_PASS" | jq -Rs '{walletPassword: .}' > /tmp/old-store.json
