#!/bin/sh

set -e

cat > input.json
UMBREL_HOST=$(jq -r '.["umbrel-host"]' input.json)
UMBREL_PASS=$(jq -r '.["umbrel-password"]' input.json)
rm input.json
>&2 echo "Stopping Umbrel Services"
sshpass -p "$UMBREL_PASS" ssh -o StrictHostKeyChecking=no umbrel@$UMBREL_HOST "echo \"$UMBREL_PASS\" | >&2 sudo -S /home/umbrel/umbrel/scripts/stop"
>&2 echo "Copying LND Data"
sshpass -p "$UMBREL_PASS" scp -o StrictHostKeyChecking=no -r -v umbrel@$UMBREL_HOST:/home/umbrel/umbrel/lnd/* /root/.lnd
echo -n 'moneyprintergobrrr' > /root/.lnd/pwd.dat
echo '{"version":"0","message":"Successfully Imported Umbrel Data","value":null,"copyable":false,"qr":false}'
