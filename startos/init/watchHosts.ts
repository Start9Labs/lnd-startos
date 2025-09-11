import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'

export const watchHosts = sdk.setupOnInit(async (effects, _) => {
  const peerInterface = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .const()
  if (!peerInterface || !peerInterface?.addressInfo) {
    return
  }

  const conf = await lndConfFile
    .read((c) => ({ externalhosts: c.externalhosts, externalip: c.externalip }))
    .const(effects)
  if (!conf) {
    return
  }
  const externalhosts = [conf.externalhosts || []].flat()
  const externalip = conf.externalip

  const externalGateway = await storeJson
    .read((s) => s.externalGateway)
    .const(effects)

  const onionsAndDomains = peerInterface.addressInfo.filter({
    kind: ['domain', 'onion'],
    visibility: 'public',
  })

  const externalHostsMissingFromInterface = externalhosts.filter(
    (h) => !onionsAndDomains.includes(h),
  )
  const onionsAndDomainsMissingFromLnd = onionsAndDomains.filter(
    (u) => !externalhosts.includes(u),
  )

  if (
    externalHostsMissingFromInterface.length ||
    onionsAndDomainsMissingFromLnd.length
  ) {
    await lndConfFile.merge(
      effects,
      {
        externalhosts: onionsAndDomains,
      },
      { allowWriteAfterConst: true },
    )
  }

  const ipForExternalGateway = peerInterface.addressInfo
    .filter({ kind: 'ipv4', visibility: 'public' }, 'hostname-info')
    .find((h) => h.kind === 'ip' && h.gateway.id === externalGateway)
    ?.hostname.value

  const publicUrls = peerInterface.addressInfo.filter({
    kind: 'ipv4',
    visibility: 'public',
  })

  if (ipForExternalGateway) {
    const publicUrlForExternalGateway = publicUrls.find((u) =>
      u.includes(ipForExternalGateway),
    )

    if (
      publicUrlForExternalGateway &&
      publicUrlForExternalGateway !== externalip
    ) {
      await lndConfFile.merge(
        effects,
        {
          externalip: publicUrlForExternalGateway,
        },
        { allowWriteAfterConst: true },
      )
    }
  }

  if (externalip && !publicUrls.includes(externalip)) {
    await lndConfFile.merge(
      effects,
      {
        externalip: undefined,
      },
      { allowWriteAfterConst: true },
    )
  }
})
