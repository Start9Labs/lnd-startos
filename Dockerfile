ARG RCLONE_VERSION=1.75.1

# ---- rclone binary fetch ----
FROM alpine:3.24 AS rclone-fetch
RUN apk add --no-cache ca-certificates curl
ARG RCLONE_VERSION
ARG TARGETARCH
ARG RCLONE_SHA256_AMD64=982b5aa772841168f8e380f139e9e787b2a105403e32b94da8676a0e1c0a13ab
ARG RCLONE_SHA256_ARM64=03f2504174034b6d004152ed7369251c9a9ec1f7e0836eda420f5c7a5ec0dff9
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

FROM lightninglabs/lnd:v0.21.3-beta

# curl calls LND's REST API for wallet setup and migration polling; sqlite
# scrubs the migrated database; openssh-client and sshpass import remote wallets;
# flock serializes copies.
RUN apk add --no-cache curl sqlite openssh-client sshpass flock

# rclone copies channel.backup to configured providers.
COPY --from=rclone-fetch /out/rclone /usr/local/bin/rclone

# lndinit drives the bolt → SQLite database migration.
COPY --from=lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta /bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh
