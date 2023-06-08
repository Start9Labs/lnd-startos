#!/bin/sh

set -e

cat > input.json
MYNODE_HOST=$(jq -r '.["mynode-host"]' input.json)
MYNODE_PASS=$(jq -r '.["mynode-password"]' input.json)
rm input.json
>&2 echo "Stopping MyNode Services"
sshpass -p $MYNODE_PASS ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "echo $MYNODE_PASS | >&2 sudo -S /usr/bin/mynode_stop_critical_services.sh"
>&2 echo "Copying LND data"
sshpass -p $MYNODE_PASS ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "sudo scp -o StrictHostKeyChecking=no -r -v /mnt/hdd/mynode/lnd/data/* /root/.lnd"
LN_CLI_PASS=$(sshpass -p "$MYNODE_PASS" ssh -o StrictHostKeyChecking=no admin@$MYNODE_HOST "cat /mnt/hdd/mynode/settings/.lndpw")
echo -n "$LN_CLI_PASS" > /root/.lnd/pwd.dat
echo '{"version":"0","message":"Successfully Imported MyNode Data","value":null,"copyable":false,"qr":false}'