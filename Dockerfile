FROM golang:alpine3.13 AS builder

RUN apk update
RUN apk add make git wget
RUN apk add --no-cache yq --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community
    
ADD . /root

WORKDIR /root/lnd

RUN make -j24 install tags="autopilotrpc signrpc walletrpc chainrpc invoicesrpc routerrpc watchtowerrpc"

FROM alpine:3.12 as runner

RUN apk update
RUN apk add tini curl sshpass jq openssh-client bash xxd

ARG ARCH

COPY --from=builder /go/bin /usr/local/bin
COPY --from=builder /usr/bin/yq /usr/local/bin/yq
ADD ./configurator/target/${ARCH}-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/${ARCH}-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
RUN chmod a+x /usr/local/bin/docker_entrypoint.sh
ADD ./actions/import-umbrel.sh /usr/local/bin/import-umbrel.sh
RUN chmod a+x /usr/local/bin/import-umbrel.sh
ADD ./actions/add-watchtower.sh /usr/local/bin/add-watchtower.sh
RUN chmod a+x /usr/local/bin/add-watchtower.sh
ADD ./actions/reset-txs.sh /usr/local/bin/reset-txs.sh
RUN chmod a+x /usr/local/bin/reset-txs.sh

WORKDIR /root

EXPOSE 9735 8080

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
