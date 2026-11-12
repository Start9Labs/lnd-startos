import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'
import { lndConfFile } from '../fileModels/lnd.conf'
import { watchtowerPort } from '../interfaces'

export const current = VersionInfo.of({
  version: '0.21.8-beta:0',
  releaseNotes: {
    en_US:
      'Updated LND to 0.21.8-beta. Full release notes: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.8-beta',
    es_ES:
      'Actualiza LND a 0.21.8-beta. Notas completas: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.8-beta',
    de_DE:
      'Aktualisiert LND auf 0.21.8-beta. Vollständige Versionshinweise: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.8-beta',
    pl_PL:
      'Aktualizuje LND do 0.21.8-beta. Pełne informacje o wydaniu: https://github.com/lightningnetwork/lnd/releases/tag/v0.21.8-beta',
    fr_FR:
      'Met à jour LND vers 0.21.8-beta. Notes complètes : https://github.com/lightningnetwork/lnd/releases/tag/v0.21.8-beta',
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
