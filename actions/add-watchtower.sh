#!/bin/sh

set -ea

cat > wtinput.json
export WT_URI=$(jq -r '.["wt-uri"]' wtinput.json)
export WT_SERVER=$(yq e '.watchtowers.wt-server' /root/.lnd/start9/config.yaml)
export WT_CLIENT=$(yq e '.watchtowers.wt-client' /root/.lnd/start9/config.yaml)
export MACAROON_HEADER="Grpc-Metadata-macaroon: $(xxd -ps -u -c 1000 /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon)"
export PUBKEY=${WT_URI%%@*}
export ADDRESS=${WT_URI#*@}
rm wtinput.json

if $WT_CLIENT || $WT_SERVER ; then
    action_result_running="    {
        \"version\": \"0\",
        \"message\": \"Successfully Added Watchtower $PUBKEY\",
        \"value\": null,
        \"copyable\": false,
        \"qr\": false
    }"

    curl --no-progress-meter -X POST --cacert /root/.lnd/tls.cert --header \
        "$MACAROON_HEADER" https://lnd.embassy:8080/v2/watchtower/client -d \
        '{"pubkey":"'$(echo $PUBKEY | xxd -r -p | base64)'","address":"'$ADDRESS'"}' >/dev/null 2>/dev/null && echo $action_result_running
    sed -n -i 'H;${x;s/^\n//;s/    - wt-uri: >-.*$/    - wt-uri: >- \n        '$WT_URI'\n&/;p;}' /root/.lnd/start9/config.yaml &&
    sed -i 's/\[\]/\n  - wt-uri: >- \n        '$WT_URI'/' /root/.lnd/start9/config.yaml
else
   action_result_running="    {
        \"version\": \"0\",
        \"message\": \"Watchtower Server or Watchtower Client need to be enabled in order to use this action.\",
        \"value\": null,
        \"copyable\": false,
        \"qr\": false
    }" >/dev/null 2>/dev/null && echo $action_result_running
fi 
