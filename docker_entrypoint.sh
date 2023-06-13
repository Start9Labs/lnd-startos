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

while ! openssl x509 -text -noout -in /mnt/cert/control.cert.pem -ext subjectAltName \
  -certopt no_subject,no_header,no_version,no_serial,no_signame,no_validity,no_issuer,no_pubkey,no_sigdump,no_aux \
  | grep "IP Address:$(ip -4 -o addr show eth0 | awk '{print $4}' | sed -e 's/\/[0-9]\+//g')"; do
  >&2 echo Cert is not yet signed for current IP...
  sleep 1;
done

# copy system cert
openssl x509 -outform der -in /mnt/cert/control.cert.pem -out /root/.lnd/start9/control.cert.der
cat /root/.lnd/start9/control.cert.der | basenc --base64url -w0 > /root/.lnd/start9/control.cert.pem.base64url
cp /mnt/cert/control.cert.pem /root/.lnd/tls.cert
cp /mnt/cert/control.key.pem /root/.lnd/tls.key
cp /mnt/cert/control.cert.pem /root/.lnd/public/tls.cert
cp /mnt/cert/control.key.pem /root/.lnd/public/tls.key
sed -i 's/\(BEGIN\|END\) PRIVATE KEY/\1 EC PRIVATE KEY/g' /root/.lnd/tls.key

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
  sleep 30
done

cat /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon | basenc --base16 -w0  > /root/.lnd/start9/admin.macaroon.hex
cat /root/.lnd/data/chain/bitcoin/mainnet/admin.macaroon | basenc --base64url -w0  > /root/.lnd/start9/admin.macaroon.base64url

trap _term SIGTERM

wait $lnd_child $configurator_child $rest_child $grpc_child
