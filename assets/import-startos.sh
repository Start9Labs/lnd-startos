#!/bin/sh

set -e
set -o pipefail

STARTOS_USER="start9"
STARTOS_04_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"
STARTOS_035_LND_VOLUME="/embassy-data/package-data/volumes/lnd/data/main"

export SSHPASS="$STARTOS_PASS"

# The password reaches the remote sudo over ssh's stdin (-S), never the command
# string. start9's sudo is passwordless on StartOS, so the line on stdin simply
# goes unread there; -S covers a box where it isn't.
startos_ssh() {
  if [ -n "$STARTOS_KEY" ]; then
    ssh -i "$STARTOS_KEY" -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T "${STARTOS_USER}@${STARTOS_HOST}" "$1"
  else
    sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -T "${STARTOS_USER}@${STARTOS_HOST}" "$1"
  fi
}
startos_sudo() {
  printf '%s\n' "$STARTOS_PASS" | startos_ssh "sudo -S $1"
}

>&2 echo "Checking origin StartOS layout and LND state"

# A 0.3.5 origin has a different volume root, status schema and password file; detect it before stopping anything.
if startos_sudo "test -d ${STARTOS_04_LND_VOLUME}"; then
  STARTOS_LND_VOLUME="$STARTOS_04_LND_VOLUME"
  ORIGIN_LAYOUT="0.4"
  STATUS_READABLE='.value.packageData.lnd.statusInfo | type == "object"'
  STATUS_STOPPED='.value.packageData.lnd.statusInfo | .desired.main == "stopped" and .started == null'
  PASSWORD_FILE="${STARTOS_LND_VOLUME}/store.json"
elif startos_sudo "test -d ${STARTOS_035_LND_VOLUME}"; then
  STARTOS_LND_VOLUME="$STARTOS_035_LND_VOLUME"
  ORIGIN_LAYOUT="0.3.5"
  STATUS_READABLE='.value["package-data"].lnd.installed.status.main.status | type == "string"'
  STATUS_STOPPED='.value["package-data"].lnd.installed.status.main.status == "stopped"'
  PASSWORD_FILE="${STARTOS_LND_VOLUME}/pwd.dat"
else
  >&2 echo "No supported LND volume found on the origin StartOS server"
  exit 1
fi

startos_sudo "test -s ${PASSWORD_FILE}" || {
  >&2 echo "The origin LND wallet password file is missing or empty"
  exit 1
}
if ! startos_sudo "test -f ${STARTOS_LND_VOLUME}/data/chain/bitcoin/mainnet/wallet.db" &&
   ! startos_sudo "test -f ${STARTOS_LND_VOLUME}/data/chain/bitcoin/mainnet/chain.sqlite"; then
  >&2 echo "No LND wallet found on the origin StartOS server"
  exit 1
fi

startos_ssh 'start-cli db dump' < /dev/null | jq -e "$STATUS_READABLE" > /dev/null || {
  >&2 echo "Could not read LND's status from the origin's start-cli"
  exit 1
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

# `package stop` returns as soon as the stop is requested. Wait for the correct
# version's explicit stopped state before copying a bolt database.
i=0
while ! startos_ssh 'start-cli db dump' < /dev/null | jq -e "$STATUS_STOPPED" > /dev/null; do
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

if [ "$ORIGIN_LAYOUT" = "0.3.5" ]; then
  # main decodes these bytes as latin1, like the in-place 0.3.5 -> 0.4 migration.
  startos_sudo "base64 ${PASSWORD_FILE}" | jq -Rs '{walletPasswordBase64: .}' > /tmp/old-store.json
else
  startos_sudo "cat ${PASSWORD_FILE}" > /tmp/old-store.json
fi
