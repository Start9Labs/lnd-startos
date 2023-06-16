#!/bin/sh

set -e

cat > input.json
RASPIBLITZ_HOST=$(jq -r '.["raspiblitz-host"]' input.json)
RASPIBLITZ_PASS=$(jq -r '.["raspiblitz-password"]' input.json)
RASPIBLITZ_LNCLI_PASS=$(jq -r '.["raspiblitz-lncli-password"]' input.json)
rm input.json
>&2 echo "Stopping RaspiBlitz LND"
sshpass -p "$RASPIBLITZ_PASS" ssh -o StrictHostKeyChecking=no admin@$RASPIBLITZ_HOST "lncli stop"
>&2 echo "Copying LND data"
sshpass -p "$RASPIBLITZ_PASS" ssh -o StrictHostKeyChecking=no admin@$RASPIBLITZ_HOST "echo \"$RASPIBLITZ_PASS\" | >&2 sudo -S chmod -R 755 /mnt/hdd/lnd/data"
sshpass -p "$RASPIBLITZ_PASS" scp -o StrictHostKeyChecking=no -r -v admin@$RASPIBLITZ_HOST:"/mnt/hdd/lnd/data" /root/.lnd

echo -n "$RASPIBLITZ_LNCLI_PASS" > /root/.lnd/pwd.dat
echo '{"version":"0","message":"Successfully Imported RaspiBlitz Data","value":null,"copyable":false,"qr":false}'