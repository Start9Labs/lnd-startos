import { writeFile } from 'fs/promises'
import { sdk } from '../sdk'

export const setupCerts = sdk.setupOnInit(async (effects) => {
  // Watched, not read once: the proxy dials the container by IP on REST's
  // internal leg, so a new container IP must reissue the cert or REST goes dark.
  const hostnames = [
    await sdk.getContainerIp(effects).const(),
    '127.0.0.1',
    await sdk.getOsIp(effects),
  ]
  const cert = (await sdk.getSslCertificate(effects, hostnames).const()).join(
    '',
  )
  const key = await sdk.getSslKey(effects, { hostnames })
  await writeFile(`/media/startos/volumes/main/tls.cert`, cert)
  await writeFile(`/media/startos/volumes/main/tls.key`, key)
})
