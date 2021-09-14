FROM arm64v8/golang:alpine3.12 AS builder

RUN apk update
RUN apk add make git

ADD . /root

WORKDIR /root/lnd

RUN make -j24 install tags="autopilotrpc signrpc walletrpc chainrpc invoicesrpc routerrpc watchtowerrpc"

FROM alpine:3.12 as runner

RUN apk update
RUN apk add tini
RUN apk add curl

COPY --from=builder /go/bin /usr/local/bin
ADD ./configurator/target/aarch64-unknown-linux-musl/release/configurator /usr/local/bin/configurator
ADD ./health-check/target/aarch64-unknown-linux-musl/release/health-check /usr/local/bin/health-check
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
RUN chmod a+x /usr/local/bin/docker_entrypoint.sh

WORKDIR /root

EXPOSE 9735 8080

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
