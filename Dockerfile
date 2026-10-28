ARG RCLONE_VERSION=1.75.2

# ---- rclone binary fetch ----
FROM alpine:3.24 AS rclone-fetch
RUN apk add --no-cache ca-certificates curl
ARG RCLONE_VERSION
ARG TARGETARCH
ARG RCLONE_SHA256_AMD64=349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702
ARG RCLONE_SHA256_ARM64=7e1e8d69654941b7b7df84ee74c5f7fb09cce7d5496947fb7bf16b55ff427d10
WORKDIR /out
RUN case "${TARGETARCH}" in \
      amd64) SHA="${RCLONE_SHA256_AMD64}" ;; \
      arm64) SHA="${RCLONE_SHA256_ARM64}" ;; \
      *)     echo "Unsupported architecture: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 \
      "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${TARGETARCH}.zip" -o rclone.zip && \
    echo "${SHA}  rclone.zip" | sha256sum -c - && \
    unzip -q rclone.zip && \
    install -m 0755 "rclone-v${RCLONE_VERSION}-linux-${TARGETARCH}/rclone" rclone

FROM lightninglabs/lnd:v0.21.5-beta

# The base image's CA store is only as current as its last release.
RUN apk add --no-cache --upgrade ca-certificates ca-certificates-bundle

# curl calls LND's REST API for wallet setup and migration polling; sqlite
# scrubs the migrated database; openssh-client and sshpass import remote wallets;
# flock serializes copies; wireguard-tools and iptables bring up and fence the Clearnet VPN tunnel (startos/vpn.ts).
RUN apk add --no-cache curl sqlite openssh-client sshpass flock wireguard-tools iptables ip6tables

# rclone copies channel.backup to configured providers.
COPY --from=rclone-fetch /out/rclone /usr/local/bin/rclone

# lndinit drives the bolt → SQLite database migration.
COPY --from=lightninglabs/lndinit:v0.1.38-beta-lnd-v0.21.5-beta /bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh
