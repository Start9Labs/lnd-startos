import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { watchtowerPort } from '../interfaces'

export const current = VersionInfo.of({
  version: '0.21.6-beta:4',
  releaseNotes: {
    en_US:
      'Requires StartOS 0.4.1 or later. Peers, watchtower clients and gRPC clients can now reach LND over your server’s IPv6 addresses.',
    es_ES:
      'Requiere StartOS 0.4.1 o posterior. Los pares, los clientes de watchtower y los clientes gRPC ahora pueden conectarse a LND a través de las direcciones IPv6 de tu servidor.',
    de_DE:
      'Erfordert StartOS 0.4.1 oder neuer. Peers, Watchtower-Clients und gRPC-Clients können LND jetzt über die IPv6-Adressen deines Servers erreichen.',
    pl_PL:
      'Wymaga StartOS 0.4.1 lub nowszego. Peery, klienci watchtowera i klienci gRPC mogą teraz łączyć się z LND przez adresy IPv6 twojego serwera.',
    fr_FR:
      'Nécessite StartOS 0.4.1 ou une version ultérieure. Les pairs, les clients watchtower et les clients gRPC peuvent désormais joindre LND via les adresses IPv6 de votre serveur.',
  },
  migrations: {
    up: async ({ effects }) => {
      if (await lndConfFile.read((c) => c['watchtower.listen']).once())
        await lndConfFile.merge(effects, {
          'watchtower.listen': [`[::]:${watchtowerPort}`],
        })
    },
    down: IMPOSSIBLE,
  },
})
