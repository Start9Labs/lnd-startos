#!/bin/sh

set -e

STARTOS_USER="start9"
STARTOS_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"
SSH_OPTS="-o StrictHostKeyChecking=no"
SSH_CMD="sshpass -p \"$STARTOS_PASS\" ssh $SSH_OPTS -T ${STARTOS_USER}@${STARTOS_HOST}"

>&2 echo "Stopping LND on origin StartOS server"

eval $SSH_CMD "start-cli package stop lnd" < /dev/null || true

>&2 echo "Copying LND data"

eval $SSH_CMD "echo '${STARTOS_PASS}' | sudo -S tar -cf - -C ${STARTOS_LND_VOLUME} data" < /dev/null \
  | tar -xf - -C /root/.lnd/

>&2 echo "Extracting wallet password"

eval $SSH_CMD "echo '${STARTOS_PASS}' | sudo -S cat ${STARTOS_LND_VOLUME}/store.json" < /dev/null \
  > /tmp/old-store.json

>&2 echo "Uninstalling LND from origin StartOS server"

eval $SSH_CMD "start-cli package uninstall lnd" < /dev/null
