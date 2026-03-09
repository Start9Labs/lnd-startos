#!/bin/sh

set -e

STARTOS_USER="start9"
STARTOS_LND_VOLUME="/media/startos/data/package-data/volumes/lnd/data/main"

>&2 echo "Stopping LND on origin StartOS server"

sshpass -p "$STARTOS_PASS" ssh -o StrictHostKeyChecking=no -T ${STARTOS_USER}@${STARTOS_HOST} \
  "echo '${STARTOS_PASS}' | sudo -S start-cli package stop lnd" < /dev/null || true

>&2 echo "Copying LND data"

sshpass -p "$STARTOS_PASS" scp -o StrictHostKeyChecking=no -r \
  ${STARTOS_USER}@${STARTOS_HOST}:${STARTOS_LND_VOLUME}/data /root/.lnd/

>&2 echo "Extracting wallet password"

sshpass -p "$STARTOS_PASS" scp -o StrictHostKeyChecking=no \
  ${STARTOS_USER}@${STARTOS_HOST}:${STARTOS_LND_VOLUME}/store.json /tmp/old-store.json

>&2 echo "Uninstalling LND from origin StartOS server"

sshpass -p "$STARTOS_PASS" ssh -o StrictHostKeyChecking=no -T ${STARTOS_USER}@${STARTOS_HOST} \
  "echo '${STARTOS_PASS}' | sudo -S start-cli package uninstall lnd" < /dev/null
