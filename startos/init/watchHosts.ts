import { lndConfFile } from '../fileModels/lnd.conf'
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

  const externalip: string[] = []
  const externalhosts: string[] = []

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
    { externalip, externalhosts },
    { allowWriteAfterConst: true },
  )
})
