#!/bin/sh

set -e

rm -f /root/.lnd/data/chain/bitcoin/mainnet/*.macaroon >/dev/null
rm -f /root/.lnd/public/*.macaroon >/dev/null
action_result_running="    {
    \"version\": \"0\",
    \"message\": \"Restarting LND to recreate macaroons.\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
action_result_stopped="    {
    \"version\": \"0\",
    \"message\": \"LND macaroons will be recreated the next time the service is started\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
lncli --rpcserver=lnd.embassy stop >/dev/null 2>/dev/null && echo $action_result_running || echo $action_result_stopped
exit 0
