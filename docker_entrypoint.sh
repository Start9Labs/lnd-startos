#!/bin/bash

set -e

_term() {
  echo "Caught SIGTERM signal!"
  kill -TERM "$lnd_child" 2>/dev/null
  kill -TERM "$configurator_child" 2>/dev/null
  kill -TERM "$rest_child" 2>/dev/null
  kill -TERM "$grpc_child" 2>/dev/null
  exit 0
}

export HOST_IP=$(ip -4 route list match 0/0 | awk '{print $3}')
export CONTAINER_IP=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')
export PEER_TOR_ADDRESS=$(yq e '.peer-tor-address' /root/.lnd/start9/config.yaml)
export CONTROL_TOR_ADDRESS=$(yq e '.control-tor-address' /root/.lnd/start9/config.yaml)

mkdir -p /root/.lnd/start9/ && mkdir -p /root/.lnd/public
echo $PEER_TOR_ADDRESS > /root/.lnd/start9/peerTorAddress
echo $CONTROL_TOR_ADDRESS > /root/.lnd/start9/controlTorAddress

# copy system cert
openssl x509 -outform der -in /mnt/cert/control.cert.pem -out /root/.lnd/start9/control.cert.der
cat /root/.lnd/start9/control.cert.der | basenc --base64url -w0 > /root/.lnd/start9/control.cert.pem.base64url
cp /mnt/cert/control.cert.pem /root/.lnd/public/

configurator
configurator_child=$!
if test -f /root/.lnd/requires.reset-txs; then
  rm /root/.lnd/requires.reset-txs &
  lnd --reset-wallet-transactions &
else
  lnd &
fi
lnd_child=$!

while ! [ -e /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon ]; do
  echo "Waiting for lnd to create macaroon..."
  sleep 1
done

cat /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon | basenc --base16 -w0  > /root/.lnd/start9/admin.macaroon.hex
cat /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon | basenc --base64url -w0  > /root/.lnd/start9/admin.macaroon.base64url

while ! nc -z localhost 8081 </dev/null; do
  echo "proxyboi: Waiting for REST server to start listening..."
  sleep 1
done
proxyboi -l 0.0.0.0:8080 --cert /mnt/cert/control.cert.pem --key /mnt/cert/control.key.pem http://localhost:8081 &
rest_child=$!
while ! nc -z localhost 10010 </dev/null; do
  echo "proxyboi: Waiting for gRPC server to start listening..."
  sleep 1
done
proxyboi -l 0.0.0.0:10009 --cert /mnt/cert/control.cert.pem --key /mnt/cert/control.key.pem http://localhost:10010 &
grpc_child=$!

trap _term SIGTERM

wait $lnd_child $configurator_child $rest_child $grpc_child
