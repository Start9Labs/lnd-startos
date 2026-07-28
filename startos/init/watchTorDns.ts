import { lndConfFile } from '../fileModels/lnd.conf'
import { sdk } from '../sdk'

export const watchTorDns = sdk.setupOnInit(async (effects) => {
  // Under `tor.active` LND resolves the DNS seeds itself — SOCKS5 can't carry
  // an SRV query — dialing `tor.dns` over TCP instead of the system resolver.
  // Its public default is unreachable here: the StartOS egress guard drops
  // container traffic to port 53 off the bridge, leaving the OS proxy as the
  // one resolver still routable (input hook, not forward).
  //
  // Not for tor-only, where it would break the lookup rather than fix it —
  // tor's dialProxy bypasses the SOCKS proxy only under
  // `skipProxyForClearNetTargets`, and no exit will reach an RFC1918 address.
  // That mode dials the SOCKS port rather than port 53, so it never had the
  // problem. Written in every other mode, as `tor.socks` is.
  const skipClearnet = await lndConfFile
    .read((c) => c['tor.skip-proxy-for-clearnet-targets'] !== false)
    .const(effects)

  await lndConfFile.merge(
    effects,
    {
      'tor.dns': skipClearnet ? `${await sdk.getOsIp(effects)}:53` : undefined,
    },
    { allowWriteAfterConst: true },
  )
})
