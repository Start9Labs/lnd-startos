import { writeFile } from 'fs/promises'
import { sdk } from '../sdk'

export const setupCerts = sdk.setupOnInit(async (effects) => {
  const hostnames = ['lnd.startos', await sdk.getContainerIp(effects).const()]
  const cert = (await sdk.getSslCerificate(effects, hostnames).const()).join('')
  const key = await sdk.getSslKey(effects, { hostnames })
  await writeFile(`/media/startos/volumes/main/tls.cert`, cert)
  await writeFile(`/media/startos/volumes/main/tls.key`, key)
})
