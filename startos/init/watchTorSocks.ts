import { socksHostId, socksPort } from 'tor-startos/startos/utils'
import { lndConfFile } from '../fileModels/lnd.conf'
import { sdk } from '../sdk'

export const watchTorSocks = sdk.setupOnInit(async (effects) => {
  // Tor SOCKS proxy over the bridge. With the 9050 fallback the address stays
  // constant (`<osIp>:9050`) across tor install/update/uninstall, so this merge
  // writes the same value on every run and never re-fires main's lnd.conf
  // `.const` watch. Written unconditionally: LND only dials the proxy when
  // `tor.active` is set, and a dead address is just connection-refused, so
  // passing it is always safe.
  const torSocks = await sdk.host
    .getBridgeAddress(effects, {
      packageId: 'tor',
      hostId: socksHostId,
      internalPort: socksPort,
      fallbackPort: socksPort,
    })
    .const()

  await lndConfFile.merge(
    effects,
    { 'tor.socks': torSocks },
    { allowWriteAfterConst: true },
  )
})
