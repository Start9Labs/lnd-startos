#!/bin/sh

set -e

>&2 echo "Stopping Umbrel Services"

echo "$UMBREL_PASS" | sshpass -p"$UMBREL_PASS" ssh -o StrictHostKeyChecking=no -T umbrel@$UMBREL_HOST "echo '$UMBREL_PASS' | sudo -S systemctl stop umbrel" < /dev/null

>&2 echo "Copying LND Data"

sshpass -p "$UMBREL_PASS" scp -o StrictHostKeyChecking=no -r -v umbrel@$UMBREL_HOST:/home/umbrel/umbrel/app-data/lightning/data/lnd/* /root/.lnd