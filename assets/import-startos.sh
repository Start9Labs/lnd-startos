#!/bin/sh

set -e
set -o pipefail

STARTOS_USER="start9"
STARTOS_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"

export SSHPASS="$STARTOS_PASS"

# The password reaches the remote sudo over ssh's stdin (-S), never the command
# string. start9's sudo is passwordless on StartOS, so the line on stdin simply
# goes unread there; -S covers a box where it isn't.
startos_ssh() {
  sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T "${STARTOS_USER}@${STARTOS_HOST}" "$1"
}
startos_sudo() {
  printf '%s\n' "$STARTOS_PASS" | startos_ssh "sudo -S $1"
}

>&2 echo "Checking the origin's database conversion state"

STARTUP_FLAGS=$(startos_sudo "cat ${STARTOS_LND_VOLUME}/startup-flags.json" 2>/dev/null || echo '{}')

if echo "$STARTUP_FLAGS" | jq -e '.dbSchemaFinalized == true and .dbMigrationComplete != true' > /dev/null 2>&1; then
  >&2 echo "The origin StartOS server is in the middle of its bolt → SQLite database conversion, so its channel database is only partially converted — importing it now risks force-closing channels."
  >&2 echo "Let the conversion finish on the origin (its LND will reach running, or its update will complete), or restore the origin from a backup, then run this migration again."
  exit 1
fi

>&2 echo "Stopping LND on origin StartOS server"

startos_ssh "start-cli package stop lnd" < /dev/null || true

# `package stop` returns as soon as the stop is requested, and copying a live
# bolt database risks a torn snapshot — wait until the service is actually down
# (statusInfo.started goes null; also null if LND isn't installed there, which
# the wallet check below then reports properly).
i=0
while [ "$(startos_ssh 'start-cli db dump 2>/dev/null' < /dev/null | jq -r '.value.packageData.lnd.statusInfo.started // "null"')" != "null" ]; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    >&2 echo "Timed out waiting for LND to stop on the origin server"
    exit 1
  fi
  sleep 2
done

>&2 echo "Copying LND data"

# Only data/ — lnd.conf and the TLS pair are StartOS's to generate. -o drops
# the origin's ownership on the way in.
startos_sudo "tar -cf - -C ${STARTOS_LND_VOLUME} data" | tar -xof - -C /root/.lnd/

# The origin may be pre-conversion (bolt wallet.db) or post-conversion (the
# wallet lives in chain.sqlite and wallet.db is tombstone-renamed).
if [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/wallet.db ] && [ ! -f /root/.lnd/data/chain/bitcoin/mainnet/chain.sqlite ]; then
  >&2 echo "No wallet found in the copied data — is LND set up on the origin server?"
  exit 1
fi

>&2 echo "Extracting wallet password"

startos_sudo "cat ${STARTOS_LND_VOLUME}/store.json" > /tmp/old-store.json
