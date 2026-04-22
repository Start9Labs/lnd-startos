import { IMPOSSIBLE, VersionInfo, YAML } from '@start9labs/start-sdk'
import { readFile, rm } from 'fs/promises'
import { lndConfFile } from '../fileModels/lnd.conf'
import { storeJson } from '../fileModels/store.json'
import { bitcoindBundle, neutrinoBundle } from '../utils'

type OldConfig = {
  bitcoind: { type: 'none' } | { type: 'internal' }
  watchtowers: {
    'wt-client':
      | { enabled: 'disabled' }
      | { enabled: 'enabled'; 'add-watchtowers': string[] }
  }
}

export const v_0_20_1_beta_2 = VersionInfo.of({
  version: '0.20.1-beta:2',
  releaseNotes: {
    en_US:
      'Stronger LND readiness check: the "LND Server" health check now queries the REST /v1/state endpoint over TLS instead of only verifying port 8080 is listening, so dependent services wait until LND can actually answer API calls.',
    es_ES:
      'Comprobación de preparación más estricta: el health check "LND Server" ahora consulta el endpoint REST /v1/state sobre TLS en lugar de limitarse a comprobar que el puerto 8080 está escuchando, de modo que los servicios dependientes esperan hasta que LND pueda responder realmente a llamadas API.',
    de_DE:
      'Strengere LND-Bereitschaftsprüfung: der Health-Check "LND Server" fragt jetzt den REST-Endpunkt /v1/state über TLS ab, anstatt nur zu prüfen, ob Port 8080 lauscht. Abhängige Dienste warten damit, bis LND tatsächlich API-Aufrufe beantworten kann.',
    pl_PL:
      'Mocniejsza kontrola gotowości LND: health check "LND Server" odpytuje teraz endpoint REST /v1/state przez TLS zamiast jedynie sprawdzać, czy port 8080 nasłuchuje, dzięki czemu usługi zależne czekają, aż LND naprawdę będzie w stanie odpowiadać na wywołania API.',
    fr_FR:
      "Vérification de disponibilité LND renforcée : le bilan de santé « LND Server » interroge désormais l'endpoint REST /v1/state via TLS au lieu de se contenter de vérifier l'écoute du port 8080, pour que les services dépendants attendent que LND puisse réellement répondre aux appels API.",
  },
  migrations: {
    up: async ({ effects }) => {
      // Try to read the old 0.3.5.x config. If it exists, we're migrating
      // from 0.3.5.x and need to carry over settings to the new store format.
      const configYaml: OldConfig | undefined = await readFile(
        '/media/startos/volumes/main/start9/config.yaml',
        'utf-8',
      ).then(YAML.parse, () => undefined)

      const prev = await storeJson
        .read()
        .once()
        .catch(() => null)
      if (configYaml) {
        const wtClient = configYaml.watchtowers?.['wt-client']

        await storeJson.merge(effects, {
          // The seed file uses "N word" format, one per line. Not all
          // installations have one, so fall back to null.
          aezeedCipherSeed:
            prev?.aezeedCipherSeed ||
            (await readFile(
              '/media/startos/volumes/main/start9/cipherSeedMnemonic.txt',
              'utf8',
            ).then(
              (contents) => {
                const words = contents
                  .trimEnd()
                  .split('\n')
                  .map((line) => line.split(' ')[1])
                return words.length === 24 ? words : null
              },
              () => null,
            )),
          walletPassword:
            prev?.walletPassword ||
            (await readFile('/media/startos/volumes/main/pwd.dat').then((buf) =>
              buf.toString('latin1'),
            )),
          watchtowerClients:
            wtClient?.enabled === 'enabled' ? wtClient['add-watchtowers'] : [],
        })

        await rm('/media/startos/volumes/main/start9', {
          recursive: true,
        }).catch(console.error)

        // Enforce backend bundle based on old config
        await lndConfFile.merge(effects, {
          externalhosts: undefined,
          ...(configYaml.bitcoind.type === 'internal'
            ? bitcoindBundle
            : neutrinoBundle),
        })
      }
    },
    down: IMPOSSIBLE,
  },
})
