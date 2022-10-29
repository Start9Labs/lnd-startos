#!/bin/sh

set -e

_term() {
  echo "Caught SIGTERM signal!"
  kill -TERM "$lnd_child" 2>/dev/null
  kill -TERM "$configurator_child" 2>/dev/null
  exit 0
}

export LND_PEERS='lncli connect 03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f@3.33.236.230:9735 && lncli connect 02bba49d7f9c57b9c05f7eb33bf4dc69b2aa37cb63caff93f13bfa88135e7f7a46@212.129.58.219:9739 && lncli connect 033dee9c6a0afc40ffd8f27d68ef260f3e5e1c19e59c6f9bb607fb04c1d497a809@98.165.150.209:9735'
export HOST_IP=$(ip -4 route list match 0/0 | awk '{print $3}')
export CONTAINER_IP=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')

configurator
configurator_child=$!
lnd &
lnd_child=$!

sleep 240
$LND_PEERS &


trap _term SIGTERM

wait $lnd_child $configurator_child
