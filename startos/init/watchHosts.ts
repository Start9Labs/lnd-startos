import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { peerHostId, peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'

export const watchHosts = sdk.setupOnInit(async (effects, _) => {
  const useTorOnly = await lndConfFile
    .read((c) => c['tor.skip-proxy-for-clearnet-targets'] === false)
    .const(effects)

  // One subscription on the peer host; the map fn extracts only the three
  // public-address groups we advertise, so this re-runs when an address
  // changes rather than on unrelated host churn.
  const addrs = await sdk.host
    .getOwn(effects, peerHostId, (host) => {
      const iface =
        host &&
        Object.values(host.bindings)
          .flatMap((b) => Object.values(b.interfaces))
          .find((i) => i.id === peerInterfaceId)
      if (!host || !iface) return undefined
      const publicInfo = iface.addressInfo.public
      return {
        onions: publicInfo
          .filter({
            predicate: ({ metadata }) =>
              metadata.kind === 'plugin' && metadata.packageId === 'tor',
          })
          .format(),
        domains: publicInfo
          .filter({
            predicate: ({ metadata }) => metadata.kind === 'public-domain',
          })
          .format(),
        ipv4s: publicInfo
          .filter({ predicate: ({ metadata }) => metadata.kind === 'ipv4' })
          .format(),
      }
    })
    .const()

  if (!addrs) {
    throw new Error('No public info')
  }

  // User-added and companion-managed hosts are always advertised, independent
  // of the Tor clearnet gate. Their presence also suppresses the public-IPv4
  // fallback below, so a tunnel never advertises the raw public IP beside it.
  const storedHosts = await storeJson
    .read((s) => ({
      custom: s.customExternalHosts,
      vpn: s.clearnetVpn?.announce ?? null,
    }))
    .const(effects)

  // Onion is always advertised; domains/IPv4 only when the Tor clearnet gate is off.
  const externalip: string[] = [...addrs.onions]
  const externalhosts: string[] = [
    ...(storedHosts?.custom ?? []),
    ...(storedHosts?.vpn ? [storedHosts.vpn] : []),
  ]

  if (!useTorOnly) {
    externalhosts.push(...addrs.domains)
    if (!externalhosts.length) {
      externalip.push(...addrs.ipv4s)
    }
  }

  await lndConfFile.merge(
    effects,
    {
      externalip: [...new Set(externalip)],
      externalhosts: [...new Set(externalhosts)],
    },
    { allowWriteAfterConst: true },
  )
})
