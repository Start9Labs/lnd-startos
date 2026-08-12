import { T } from '@start9labs/start-sdk'
import { writeFile } from 'fs/promises'
import { sdk } from '../sdk'

/**
 * Issue the TLS pair for the current container/OS addresses and write it to
 * the volume. Watched, not read once: the proxy dials the container by IP on
 * REST's internal leg, so a new container IP must reissue the cert or REST
 * goes dark. Also called by the `:12` update migration before the bolt →
 * SQLite conversion (versions/current.ts): the migration runs earlier in init
 * than this step, and the conversion pins its LND-facing curls to this cert
 * on 127.0.0.1 — a SAN pre-0.21 certs don't carry, which would wedge the
 * update until the conversion's timeout.
 */
export async function writeCerts(effects: T.Effects): Promise<void> {
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
}

export const setupCerts = sdk.setupOnInit(writeCerts)
