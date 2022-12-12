#!/bin/bash

set -e

_term() {
  echo "Caught SIGTERM signal!"
  kill -TERM "$lnd_child" 2>/dev/null
  kill -TERM "$configurator_child" 2>/dev/null
  exit 0
}

export HOST_IP=$(ip -4 route list match 0/0 | awk '{print $3}')
export CONTAINER_IP=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')

configurator
configurator_child=$!
if test -f /root/.lnd/requires.reset-txs; then
  rm /root/.lnd/requires.reset-txs &
  lnd --reset-wallet-transactions &
else
  lnd &
fi
lnd_child=$!

trap _term SIGTERM

wait $lnd_child $configurator_child
