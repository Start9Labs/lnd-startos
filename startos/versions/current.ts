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
  advanced?: {
    'protocol-simple-taproot-chans'?: boolean
  }
}

export const current = VersionInfo.of({
  version: '0.20.1-beta:13',
  releaseNotes: {
    en_US:
      'Fixes the **Network and Graph Sync Progress** health check spuriously reporting a failure and flooding the logs while LND is still starting up — most visibly right after an upgrade, when Bitcoin Core is still loading. The check now reports **Starting** until LND is ready to answer.',
    es_ES:
      'Corrige el chequeo de estado **Progreso de sincronización de red y grafo** que reportaba erróneamente un fallo e inundaba los registros mientras LND aún se estaba iniciando — más visible justo después de una actualización, cuando Bitcoin Core todavía se está cargando. Ahora el chequeo indica **Iniciando** hasta que LND está listo para responder.',
    de_DE:
      'Behebt einen Fehler, bei dem die Zustandsprüfung **Netzwerk- und Graph-Synchronisierungsfortschritt** fälschlicherweise einen Fehler meldete und die Protokolle überflutete, während LND noch startete — am deutlichsten direkt nach einer Aktualisierung, wenn Bitcoin Core noch lädt. Die Prüfung meldet jetzt **Startet**, bis LND antwortbereit ist.',
    pl_PL:
      'Naprawia kontrolę stanu **Postęp synchronizacji sieci i grafu**, która błędnie zgłaszała awarię i zalewała logi, gdy LND wciąż się uruchamiał — najbardziej widoczne tuż po aktualizacji, gdy Bitcoin Core nadal się ładuje. Kontrola zgłasza teraz **Uruchamianie**, dopóki LND nie jest gotowy do odpowiedzi.',
    fr_FR:
      "Corrige le contrôle de santé **Progression de la synchronisation du réseau et du graphe** qui signalait à tort un échec et inondait les journaux pendant que LND démarrait encore — surtout juste après une mise à jour, lorsque Bitcoin Core est encore en cours de chargement. Le contrôle indique désormais **Démarrage** jusqu'à ce que LND soit prêt à répondre.",
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

        // Enforce backend bundle based on old config; carry over any
        // experimental-taproot-channels setting from the 0.3.5.x GUI.
        await lndConfFile.merge(effects, {
          externalhosts: undefined,
          ...(configYaml.bitcoind.type === 'internal'
            ? bitcoindBundle
            : neutrinoBundle),
          'protocol.simple-taproot-chans':
            configYaml.advanced?.['protocol-simple-taproot-chans'] || undefined,
        })
      }
    },
    down: IMPOSSIBLE,
  },
})
