FROM arm32v7/golang:alpine AS builder

RUN apk update
RUN apk add make git

ADD . /root

WORKDIR /root/lnd

RUN make install tags="signrpc walletrpc chainrpc invoicesrpc"

FROM alpine:3.12 as runner

RUN apk update
RUN apk add tini
RUN apk add curl

COPY --from=builder /go/bin /usr/local/bin
ADD ./configurator/target/armv7-unknown-linux-musleabihf/release/configurator /usr/local/bin/configurator
ADD ./docker_entrypoint.sh /usr/local/bin/docker_entrypoint.sh
RUN chmod a+x /usr/local/bin/docker_entrypoint.sh

WORKDIR /root

EXPOSE 9735 8080

ENTRYPOINT ["/usr/local/bin/docker_entrypoint.sh"]
