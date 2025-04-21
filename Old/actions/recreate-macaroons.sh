#!/bin/sh

set -e

rm -f /root/.lnd/data/chain/bitcoin/mainnet/*.macaroon >/dev/null
rm -f /root/.lnd/public/*.macaroon >/dev/null

action_result_running="    {
    \"version\": \"0\",
    \"message\": \"Existing macaroons have been deleted. Restarting LND to recreate macaroons.\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
kill -s SIGTERM 1 && echo $action_result_running

exit 0
