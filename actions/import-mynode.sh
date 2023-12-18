#!/bin/sh

set -e

cat > input.json
MYNODE_HOST=$(jq -r '.["mynode-host"]' input.json)
MYNODE_PASS=$(jq -r '.["mynode-password"]' input.json)
rm input.json

if [ ! -e "/root/.lnd/pwd.dat" ]; then
  >&2 echo "Stopping MyNode Services"
  sshpass -p "$MYNODE_PASS" ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "echo \"$MYNODE_PASS\" | >&2 sudo -S /usr/bin/mynode_stop_critical_services.sh"
  >&2 echo "Copying LND data"
  sshpass -p "$MYNODE_PASS" ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "echo \"$MYNODE_PASS\" | >&2 sudo -S chmod -R 755 /mnt/hdd/mynode/lnd/data"
  sshpass -p "$MYNODE_PASS" scp -o StrictHostKeyChecking=no -r -v admin@$MYNODE_HOST:"/mnt/hdd/mynode/lnd/data" /root/.lnd

  LN_CLI_PASS=$(sshpass -p "$MYNODE_PASS" ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "echo \"$MYNODE_PASS\" | sudo -S cat /mnt/hdd/mynode/settings/.lndpw")
  echo -n "$LN_CLI_PASS" > /root/.lnd/pwd.dat
  echo '{"version":"0","message":"Successfully Imported MyNode Data. Warning!!! With the Migration of LND complete, be sure to NEVER re-start your MyNode using the same LND seed! You should never run two different lnd nodes with the same seed! This will lead to strange/unpredictable behavior or even loss of funds.","value":null,"copyable":false,"qr":false}'
else
  echo "Error: Existing LND data found on StartOS. MyNode LND Data has not been migrated to StartOS. If you are CERTAIN there are no LND funds on StartOS and you would like to migrate data from another node, you will need to uninstall LND from StartOS and re-run this action on a fresh install of LND BEFORE ever starting the LND service on StartOS." >&2
  exit 1
fi