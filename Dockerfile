# LND image + the lndinit binary.
#
# We don't use the upstream combined image (lightninglabs/lndinit:<v>-lnd-<v>)
# directly because, at time of writing, only release-candidate pairings exist
# for lnd v0.21.0-beta — no final `…-lnd-v0.21.0-beta` tag has been published.
# Instead we keep the final lnd image as the base and copy in just the lndinit
# binary, which is versioned independently (v0.1.35-beta). lndinit is used by
# the bolt → SQLite database migration in startos/versions/current.ts.
#
# TODO(release): once lightninglabs publishes the final
# `lightninglabs/lndinit:v0.1.35-beta-lnd-v0.21.0-beta` image, switch the
# COPY source to that tag (drop the `.rc3`).
FROM lightninglabs/lnd:v0.21.0-beta

# v0.21's image switched base from Debian to Alpine and dropped curl, which the
# startos layer shells into the container for (wallet init/unlock, the migration's
# state polling — all hit LND's REST endpoint). Restore it.
RUN apk add --no-cache curl

COPY --from=lightninglabs/lndinit:v0.1.35-beta-lnd-v0.21.0-beta.rc3 /bin/lndinit /bin/lndinit
