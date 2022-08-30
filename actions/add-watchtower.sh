#!/bin/sh

set -e

cat > wtinput.json
export WT_URI=$(jq -r '.["wt-uri"]' wtinput.json)
export WT_SERVER=$(yq e '.watchtowers.wt-server' /root/.lnd/start9/config.yaml)
export WT_CLIENT=$(yq e '.watchtowers.wt-client' /root/.lnd/start9/config.yaml)
export MACAROON_HEADER="Grpc-Metadata-macaroon: $(xxd -ps -u -c 1000 /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon)"
export PUBKEY=${WT_URI%%@*}
export ADDRESS=${WT_URI#*@}
rm wtinput.json

if $WT_CLIENT ; then
    action_result_running="    {
        \"version\": \"0\",
        \"message\": \"Successfully Added Watchtower $PUBKEY\",
        \"value\": null,
        \"copyable\": false,
        \"qr\": false
    }"
    action_result_error="    {
        \"version\": \"0\",
        \"message\": \"Error: Not able to add watchtower. Please check the log for details.\",
        \"value\": null,
        \"copyable\": false,
        \"qr\": false
    }"
    export WT_RES=$(curl --no-progress-meter -X POST --cacert /root/.lnd/tls.cert --header "$MACAROON_HEADER" https://lnd.embassy:8080/v2/watchtower/client -d '{"pubkey":"'$(echo $PUBKEY | xxd -r -p | base64)'","address":"'$ADDRESS'"}')
  
        if test "$WT_RES" != "{}"; then
            echo $action_result_error
        else
            echo $action_result_running
            export EXISTING_WT=$(grep $WT_URI /root/.lnd/start9/config.yaml)
            if ! [ $EXISTING_WT == $WT_URI ]; then
                sed -i "s/add-watchtowers:.*/add-watchtowers:\n    - >-\n      $WT_URI/" /root/.lnd/start9/config.yaml
            fi
        fi

else
   action_result_running="    {
        \"version\": \"0\",
        \"message\": \"Watchtower Client needs to be enabled in order to use this action.\",
        \"value\": null,
        \"copyable\": false,
        \"qr\": false
    }" >/dev/null 2>/dev/null && echo $action_result_running
fi 
