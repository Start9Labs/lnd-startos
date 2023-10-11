#!/bin/sh

set -e

cat > input.json
UMBREL_HOST=$(jq -r '.["umbrel-host"]' input.json)
UMBREL_PASS=$(jq -r '.["umbrel-password"]' input.json)
rm input.json

if [ ! -e "/root/.lnd/pwd.dat" ]; then
  >&2 echo "Stopping Umbrel Services"
  sshpass -p "$UMBREL_PASS" ssh -o StrictHostKeyChecking=no umbrel@$UMBREL_HOST "echo '$UMBREL_PASS' | >&2 sudo -S /home/umbrel/umbrel/scripts/stop"
  >&2 echo "Copying LND Data"
  sshpass -p "$UMBREL_PASS" scp -o StrictHostKeyChecking=no -r -v umbrel@$UMBREL_HOST:/home/umbrel/umbrel/app-data/lightning/data/lnd/* /root/.lnd
  echo -n 'moneyprintergobrrr' > /root/.lnd/pwd.dat
  echo '{"version":"0","message":"Successfully Imported Umbrel Data","value":null,"copyable":false,"qr":false}'
else
  echo "Error: Existing LND data found on StartOS. Umbrel LND Data has not been migrated to StartOS. If you are CERTAIN there are no LND funds on StartOS and you would like to migrate data from another node, you will need to uninstall LND from StartOS and re-run this action on a fresh install of LND BEFORE ever starting the LND service on StartOS." >&2
  exit 1
fi
