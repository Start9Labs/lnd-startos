import { writeFile } from 'fs/promises'
import { sdk } from '../sdk'
import { gRPCHostId, gRPCInterfaceId } from '../interfaces'

export const setupCerts = sdk.setupOnInit(async (effects) => {
  // `.startos` and direct container-IP addressing are deprecated; dependents now
  // reach LND over the LXC bridge at `<osIp>:<port>`. The cert must therefore
  // cover both LND's bridge interface address and the raw OS bridge IP so a
  // dependent connecting through the bridge (and pinning this self-signed cert
  // via SNI-passthrough) still verifies. `setInterfaces` runs before this init
  // step, so the gRPC interface is already exported and its bridge address
  // resolves here. The legacy SANs (`lnd.startos`, container IP) stay until
  // `.startos` is removed.
  const bridgeHostnames = await sdk.host
    .getOwn(effects, gRPCHostId, (host) => {
      const iface =
        host &&
        Object.values(host.bindings)
          .flatMap((b) => Object.values(b.interfaces))
          .find((i) => i.id === gRPCInterfaceId)
      return iface
        ? iface.addressInfo
            .filter({ kind: 'bridge' })
            .hostnames.map((h) => h.hostname)
        : []
    })
    .const()

  const hostnames = [
    'lnd.startos',
    // localhost: some init/action flows curl a temporary lnd they spawn in their
    // own subcontainer (wallet init, the SQLite migration), which is reached on
    // 127.0.0.1 — so the served cert must cover it too.
    '127.0.0.1',
    // Legacy container IP, read once (non-reactive) — kept transitionally until
    // `.startos`/container-IP addressing is retired.
    await sdk.getContainerIp(effects).once(),
    // OS bridge IP (10.0.3.1): the address dependents now dial LND on.
    await sdk.getOsIp(effects),
    ...bridgeHostnames,
  ]
  const cert = (await sdk.getSslCertificate(effects, hostnames).const()).join(
    '',
  )
  const key = await sdk.getSslKey(effects, { hostnames })
  await writeFile(`/media/startos/volumes/main/tls.cert`, cert)
  await writeFile(`/media/startos/volumes/main/tls.key`, key)
})
