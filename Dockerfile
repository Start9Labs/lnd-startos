FROM lightninglabs/lnd:v0.21.3-beta

# curl calls LND's REST API for wallet setup and migration polling; sqlite
# scrubs the migrated database; openssh-client and sshpass import remote wallets;
# rclone copies channel.backup to configured providers; flock serializes copies.
RUN apk add --no-cache curl sqlite openssh-client sshpass rclone flock

# lndinit drives the bolt → SQLite database migration.
COPY --from=lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta /bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh
