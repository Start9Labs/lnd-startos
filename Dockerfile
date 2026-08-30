# LND image + the lndinit binary.
#
# We base on the canonical lightninglabs/lnd image and copy in just the lndinit
# binary, rather than using the upstream combined image (lightninglabs/lndinit:
# <lndinit>-lnd-<lnd>) as the base: that combined image lags lnd releases and
# would block future lnd bumps, whereas adding lndinit on top keeps the runtime
# decoupled from lndinit's publish cadence. lndinit drives the bolt → SQLite
# database migration in startos/versions/current.ts.
FROM lightninglabs/lnd:v0.21.2-beta

# v0.21's image switched base from Debian to Alpine and dropped curl, which the
# startos layer shells into the container for (wallet init/unlock, the migration's
# state polling — all hit LND's REST endpoint). Restore it. sqlite3 is for the
# migration's zombie-index scrub (startos/sqliteBackend.ts); ssh and sshpass are
# how the Initialize Wallet migrations pull an LND data directory off the origin
# node (assets/import-*.sh).
RUN apk add --no-cache curl sqlite openssh-client sshpass rclone mutt inotify-tools jq

COPY --from=lightninglabs/lndinit:v0.1.36-beta-lnd-v0.21.2-beta /bin/lndinit /bin/lndinit
