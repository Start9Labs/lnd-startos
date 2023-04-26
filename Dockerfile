FROM lightninglabs/lnd:v0.16.1-beta

ARG ARCH
ARG PLATFORM
RUN apk update
RUN apk add \
    bash \
    coreutils \
    curl \
    jq \
    netcat-openbsd \
    openssh-client \
    openssl \
    sshpass \
    xxd \
    ca-certificates \
    make git wget

RUN wget https://github.com/mikefarah/yq/releases/download/v4.25.3/yq_linux_${PLATFORM}.tar.gz -O - |\
    tar xz && mv yq_linux_${PLATFORM} /usr/bin/yq

WORKDIR /root/lnd

ADD ./configurator/target/${ARCH}-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/${ARCH}-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/*.sh /usr/local/bin/
RUN chmod a+x /usr/local/bin/*.sh

WORKDIR /root

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
