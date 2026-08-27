import { T, utils } from '@start9labs/start-sdk'
import { writeFile } from 'fs/promises'
import { gRPCHostId, gRPCPort } from '../interfaces'
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
  // the address it dialed — each one has to be a SAN. Read off the binding,
  // which owns the addresses; an exported interface carries only a view of
  // them that vanishes with it. getSslCertificate signs only an IP the box
  // itself holds, which is what drops the WAN IPv4: that address is the
  // router's, not ours. Sorted — the OS guarantees no order, and a reshuffle
  // would reissue the certificate and restart LND.
  const served = await sdk.host
    .getOwn(effects, gRPCHostId, (host) =>
      host
        ? utils
            .filledAddress(host, {
              hostId: gRPCHostId,
              internalPort: gRPCPort,
              username: null,
              scheme: null,
              sslScheme: null,
              suffix: '',
            })
            .matchesAny([
              { visibility: 'private' },
              { exclude: { kind: 'ipv4' } },
            ])
            .filter({ exclude: { kind: ['localhost', 'link-local'] } })
            .hostnames.map((h) => h.hostname)
            .sort()
        : [],
    )
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
