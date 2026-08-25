import { T } from '@start9labs/start-sdk'
import { writeFile } from 'fs/promises'
import { gRPCHostId, gRPCInterfaceId } from '../interfaces'
import { sdk } from '../sdk'

/**
 * Issue the TLS pair for every address LND is reached at and write it to the
 * volume. Watched, not read once: the proxy dials the container by IP on
 * REST's internal leg, so a new container IP must reissue the cert or REST
 * goes dark. Also called by the `:12` update migration before the bolt →
 * SQLite conversion (versions/current.ts): the migration runs earlier in init
 * than this step, and the conversion pins its LND-facing curls to this cert
 * on 127.0.0.1 — a SAN pre-0.21 certs don't carry, which would wedge the
 * update until the conversion's timeout.
 */
export async function writeCerts(effects: T.Effects): Promise<void> {
  // gRPC is TLS passthrough, so a client validates this certificate against
  // the address it dialed — each one has to be a SAN. Everything but the WAN
  // IPv4, which getSslCertificate refuses to sign.
  const served = await sdk.host
    .getOwn(effects, gRPCHostId, (host) => {
      const iface =
        host &&
        Object.values(host.bindings)
          .flatMap((b) => Object.values(b.interfaces))
          .find((i) => i.id === gRPCInterfaceId)
      return iface
        ? iface.addressInfo
            .matchesAny([
              { visibility: 'private' },
              { exclude: { kind: 'ipv4' } },
            ])
            .hostnames.map((h) => h.hostname)
        : []
    })
    .const()

  const hostnames = [
    await sdk.getContainerIp(effects).const(),
    '127.0.0.1',
    await sdk.getOsIp(effects),
    ...served,
  ]
  const cert = (await sdk.getSslCertificate(effects, hostnames).const()).join(
    '',
  )
  const key = await sdk.getSslKey(effects, { hostnames })
  await writeFile(`/media/startos/volumes/main/tls.cert`, cert)
  await writeFile(`/media/startos/volumes/main/tls.key`, key)
}

export const setupCerts = sdk.setupOnInit(writeCerts)
