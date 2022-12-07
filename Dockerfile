FROM lightninglabs/lnd:v0.15.4-beta

# arm64 or amd64
ARG PLATFORM
ARG ARCH

RUN apk update
RUN apk add --no-cache make git wget yq tini curl sshpass jq openssh-client bash vim && \
    rm -f /var/cache/apk/*

ADD ./configurator/target/${ARCH}-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/${ARCH}-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
ADD ./actions/import-umbrel-5.sh /usr/local/bin/import-umbrel-5.sh
RUN chmod a+x /usr/local/bin/*.sh
