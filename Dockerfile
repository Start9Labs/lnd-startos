FROM lightninglabs/lnd:v0.15.3-beta

# arm64 or amd64
ARG PLATFORM
ARG ARCH

RUN apk update
RUN apk add --no-cache make git wget yq tini curl sshpass jq openssh-client bash vim && \
    rm -f /var/cache/apk/*

ADD lnd.conf /usr/local/bin/lnd.conf
ADD ./configurator/target/aarch64-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/aarch64-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
ADD ./actions/add-peer.sh /usr/local/bin/add-peer.sh
RUN chmod a+x /usr/local/bin/*.sh
