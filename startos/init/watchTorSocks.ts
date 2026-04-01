import { lndConfFile } from '../fileModels/lnd.conf'
import { sdk } from '../sdk'

export const watchTorSocks = sdk.setupOnInit(async (effects) => {
  const torIp = await sdk.getContainerIp(effects, { packageId: 'tor' }).const()

  await lndConfFile.merge(
    effects,
    { 'tor.socks': torIp ? `${torIp}:9050` : undefined },
    { allowWriteAfterConst: true },
  )
})
