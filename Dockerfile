FROM lightninglabs/lnd:v0.15.3-beta

# arm64 or amd64
ARG PLATFORM
ARG ARCH

RUN apk update
RUN apk add --no-cache --virtual make git wget yq tini curl sshpass jq openssh-client bash vim && \
    rm -f /var/cache/apk/*

# RUN make -j24 install tags="autopilotrpc signrpc walletrpc chainrpc invoicesrpc routerrpc watchtowerrpc"

ADD ./configurator/target/aarch64-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/aarch64-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
RUN chmod a+x /usr/local/bin/*.sh

