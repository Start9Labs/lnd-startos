FROM golang:1.19.2-alpine as builder

# arm64 or amd64
ARG PLATFORM
ARG ARCH

RUN apk update
RUN apk add make git wget
RUN wget https://github.com/mikefarah/yq/releases/download/v4.6.3/yq_linux_${PLATFORM}.tar.gz -O - |\
  tar xz && mv yq_linux_${PLATFORM} /usr/bin/yq
    
ADD . /root

WORKDIR /root/lnd

RUN make -j24 install tags="autopilotrpc signrpc walletrpc chainrpc invoicesrpc routerrpc watchtowerrpc"

FROM alpine as runner

# arm64 or amd64
ARG PLATFORM
ARG ARCH

RUN apk update
RUN apk add tini curl sshpass jq openssh-client bash vim

COPY --from=builder /go/bin /usr/local/bin
COPY --from=builder /usr/bin/yq /usr/local/bin/yq
ADD ./configurator/target/aarch64-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/aarch64-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
RUN chmod a+x /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
RUN chmod a+x /usr/local/bin/import-umbrel.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
RUN chmod a+x /usr/local/bin/add-watchtower.sh

WORKDIR /root
