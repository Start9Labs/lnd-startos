FROM lightninglabs/lnd:v0.20.1-beta

ARG ARCH
RUN apk add --no-cache \
    bash \
    coreutils \
    curl \
    jq \
    yq \
    netcat-openbsd \
    openssh-client \
    openssl \
    sshpass \
    xxd \
    ca-certificates \
    make \
    git

WORKDIR /root/lnd

ADD ./configurator/target/${ARCH}-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/${ARCH}-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/*.sh /usr/local/bin/
RUN chmod a+x /usr/local/bin/*.sh

WORKDIR /root

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
