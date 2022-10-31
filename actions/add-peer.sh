#!/bin/sh

set -e

cat > peerinput.json
export PEER_URI=$(jq -r '.["peer-uri"]' peerinput.json)
export PERSIST=true
export TIMEOUT=60
export MACAROON_HEADER="Grpc-Metadata-macaroon: $(xxd -ps -u -c 1000 /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon)"
export PUBKEY=${PEER_URI%%@*}
export ADDRESS=${PEER_URI#*@}

# Not sure if this is the correct format
export PEER=("$PUBKEY" "$ADDRESS")

rm peerinput.json
action_result_running="    {
    \"version\": \"0\",
    \"message\": \"Successfully Added Peer $PUBKEY\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
action_result_error="    {
    \"version\": \"0\",
    \"message\": \"Error: Not able to add Peer $PEER_URI. Please check the log for details.\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"

# Not sure if this is the correct format for PEER address
export PEER_RES=$(curl --no-progress-meter -X POST --cacert /root/.lnd/tls.cert --header "$MACAROON_HEADER" https://lnd.embassy:8080/v1/peers -d '{"addr":"'$PEER'","perm":"'$PERSIST'","timeout":"'$TIMEOUT'"}')

if test "$PEER_RES" != "{}"; then
    echo $action_result_error
else
    echo $action_result_running
fi
