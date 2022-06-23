#!/bin/sh

set -e

cat > input.json
UMBREL_PASS=$(jq -r '.["umbrel-password"]' input.json)
UMBREL_IP=$(jq -r '.["umbrel-ip"]' input.json)
sshpass -p $UMBREL_PASS scp -o StrictHostKeyChecking=no -r umbrel@$UMBREL_IP:/home/umbrel/umbrel/lnd /root/.lnd
echo -n 'moneyprintergobrrr' > /root/.lnd/pwd.dat
echo '{"version":"0","message":"Successfully Imported Umbrel Data","value":null,"copyable":false,"qr":false}'