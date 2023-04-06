FROM golang:alpine3.16 AS builder

RUN apk update
RUN apk add make git wget
RUN apk add --no-cache yq --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community

ADD ./lnd /root/lnd

WORKDIR /root/lnd

RUN make -j24 install tags="autopilotrpc signrpc walletrpc chainrpc invoicesrpc routerrpc watchtowerrpc"

FROM alpine:3.16 as runner

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
    ca-certificates

RUN wget https://github.com/mikefarah/yq/releases/download/v4.25.3/yq_linux_${PLATFORM}.tar.gz -O - |\
    tar xz && mv yq_linux_${PLATFORM} /usr/bin/yq

COPY --from=builder /go/bin /usr/local/bin
COPY --from=builder /usr/bin/yq /usr/local/bin/yq
ADD ./configurator/target/${ARCH}-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/${ARCH}-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
ADD ./actions/import-umbrel-5.sh /usr/local/bin/import-umbrel-5.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
ADD ./actions/reset-txs.sh /usr/local/bin/reset-txs.sh
RUN chmod a+x /usr/local/bin/*.sh

WORKDIR /root

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
