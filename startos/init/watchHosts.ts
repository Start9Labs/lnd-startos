import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'

export const watchHosts = sdk.setupOnInit(async (effects, _) => {
  const useTorOnly = await lndConfFile
    .read((c) => c['tor.skip-proxy-for-clearnet-targets'] === false)
    .const(effects)

  const publicInfo = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId, (i) => i?.addressInfo?.public)
    .const()

  if (!publicInfo) {
    throw new Error('No public info')
  }

  // User-added hosts (e.g. a Tunnelsats/VPN endpoint) are always advertised,
  // independent of the Tor clearnet gate. Seeding externalhosts with them also
  // means a present custom host suppresses the public-IPv4 fallback below — if
  // the user added a tunnel, we don't also leak their raw public IP.
  const customExternalHosts =
    (await storeJson.read((s) => s.customExternalHosts).const(effects)) ?? []

  const externalip: string[] = []
  const externalhosts: string[] = [...customExternalHosts]

  // Add first onion address (if present)
  const onions = publicInfo
    .filter({
      predicate: ({ metadata }) =>
        metadata.kind === 'plugin' && metadata.packageId === 'tor',
    })
    .format()

  externalip.push(...onions)

  if (!useTorOnly) {
    const domains = publicInfo
      .filter({
        predicate: ({ metadata }) => metadata.kind === 'public-domain',
      })
      .format()

    externalhosts.push(...domains)

    if (!externalhosts.length) {
      const ipv4s = publicInfo
        .filter({
          predicate: ({ metadata }) => metadata.kind === 'ipv4',
        })
        .format()

      externalip.push(...ipv4s)
    }
  }

  await lndConfFile.merge(
    effects,
    {
      externalip: [...new Set(externalip)],
      externalhosts: [...new Set(externalhosts)],
    },
    { allowWriteAfterConst: true },
  )
})
