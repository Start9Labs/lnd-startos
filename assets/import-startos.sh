#!/bin/sh

set -e

STARTOS_USER="start9"
STARTOS_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH_CMD="sshpass -p \"$STARTOS_PASS\" ssh $SSH_OPTS -T ${STARTOS_USER}@${STARTOS_HOST}"

>&2 echo "Checking the origin's database conversion state"

# The password reaches the remote sudo over ssh's stdin: eval re-parses its
# joined arguments, so a `|` inside the command string would pipe locally.
STARTUP_FLAGS=$(echo "${STARTOS_PASS}" | eval $SSH_CMD "sudo -S cat ${STARTOS_LND_VOLUME}/startup-flags.json" 2>/dev/null || echo '{}')

if echo "$STARTUP_FLAGS" | jq -e '.dbSchemaFinalized == true and .dbMigrationComplete != true' > /dev/null 2>&1; then
  >&2 echo "The origin StartOS server is in the middle of its bolt → SQLite database conversion, so its channel database is only partially converted — importing it now risks force-closing channels."
  >&2 echo "Let the conversion finish on the origin (its LND will reach running, or its update will complete), or restore the origin from a backup, then run this migration again."
  exit 1
fi

>&2 echo "Stopping LND on origin StartOS server"

eval $SSH_CMD "start-cli package stop lnd" < /dev/null || true

>&2 echo "Copying LND data"

echo "${STARTOS_PASS}" | eval $SSH_CMD "sudo -S tar -cf - -C ${STARTOS_LND_VOLUME} data" \
  | tar -xf - -C /root/.lnd/

>&2 echo "Extracting wallet password"

echo "${STARTOS_PASS}" | eval $SSH_CMD "sudo -S cat ${STARTOS_LND_VOLUME}/store.json" \
  > /tmp/old-store.json

>&2 echo "Uninstalling LND from origin StartOS server"

eval $SSH_CMD "start-cli package uninstall lnd" < /dev/null
