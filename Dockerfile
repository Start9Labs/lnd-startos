FROM lightninglabs/lnd:v0.21.3-beta

# v0.21's image switched base from Debian to Alpine and dropped curl, which the
# startos layer shells into the container for (wallet init/unlock, the migration's
# state polling — all hit LND's REST endpoint). Restore it. sqlite3 is for the
# migration's zombie-index scrub (startos/sqliteBackend.ts); ssh and sshpass are
# how the Initialize Wallet migrations pull an LND data directory off the origin
# node (assets/import-*.sh). rclone ships channel.backup to the targets the
# Configure Channel Backups action sets up (backup-agent.sh), and flock
# serializes its backup and restore operations; jq is already in the upstream
# image and the agent uses it to read that config.
RUN apk add --no-cache curl sqlite openssh-client sshpass rclone flock

# lndinit drives the bolt → SQLite database migration.
COPY --from=lightninglabs/lndinit:v0.1.37-beta-lnd-v0.21.3-beta /bin/lndinit /bin/lndinit

# Continuous off-box copy of channel.backup (see startos/main.ts).
COPY backup-agent.sh /usr/local/bin/backup-agent.sh
