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

  // Add first onion address (if present)
  const onion = publicInfo
    .filter({
      predicate: ({ metadata }) =>
        metadata.kind === 'plugin' && metadata.packageId === 'tor',
    })
    .format()?.[0]

  if (onion) externalip.push(onion)

  // Add gateway IPv4 (if present and not tor-only)
  if (!useTorOnly) {
    const outboundGateway = await sdk.getOutboundGateway(effects).const()

    const gatewayIp = publicInfo.hostnames.find(
      (h) =>
        'metadata' in h &&
        h.metadata.kind === 'ipv4' &&
        h.metadata.gateway === outboundGateway,
    )?.hostname

    if (gatewayIp) externalip.push(gatewayIp)
  }

  await lndConfFile.merge(
    effects,
    { externalip },
    { allowWriteAfterConst: true },
  )
})
