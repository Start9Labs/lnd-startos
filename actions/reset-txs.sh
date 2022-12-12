#!/bin/sh

set -e

touch /root/.lnd/requires.reset_txs
action_result_running="    {
    \"version\": \"0\",
    \"message\": \"LND restarting in reset txs mode\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
action_result_stopped="    {
    \"version\": \"0\",
    \"message\": \"LND will reset txs the next time the service is started\",
    \"value\": null,
    \"copyable\": false,
    \"qr\": false
}"
lncli --rpcserver=lnd.embassy stop >/dev/null 2>/dev/null && echo $action_result_running || echo $action_result_stopped