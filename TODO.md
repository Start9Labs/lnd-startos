# TODO

- **Bump the `lndinit` image source in `Dockerfile` to a final (non-rc) tag.**
  The Dockerfile copies the `lndinit` binary from
  `lightninglabs/lndinit:v0.1.35-beta-lnd-v0.21.0-beta.rc3` because Lightning
  Labs has not yet published the final `…-lnd-v0.21.0-beta` pairing — and
  `lndinit v0.1.35` is required (it's built against lnd 0.21's channeldb schema
  v35; an older lndinit rejects the migrated DB). Switch the `COPY --from=`
  source to the final tag once it exists; avoids depending on an RC tag.

  We intentionally keep the Dockerfile rather than switching the whole image to
  the combined `lndinit` dockerTag: that image lags lnd releases and would block
  future lnd bumps, whereas basing on the canonical `lightninglabs/lnd` image
  and adding `lndinit` keeps the runtime decoupled from lndinit's publish cadence.
