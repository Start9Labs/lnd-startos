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
  version: '0.21.0-beta:0',
  releaseNotes: {
    en_US:
      'Updates LND to 0.21.0-beta and moves the database off the legacy bolt backend to SQLite, removing the slow startup compaction step. The one-time conversion runs automatically the first time LND starts after updating and cannot be undone — back up your node before updating. If it fails, LND will not start, so you can retry. That first start may take a while, as LND also converts to native SQL.',
    es_ES:
      'Actualiza LND a 0.21.0-beta y cambia la base de datos del antiguo backend bolt a SQLite, eliminando el lento paso de compactación al iniciar. La conversión única se ejecuta automáticamente la primera vez que LND arranca tras la actualización y no se puede deshacer: haz una copia de seguridad de tu nodo antes de actualizar. Si falla, LND no arrancará, así que podrás reintentarlo. Ese primer arranque puede tardar, ya que LND también convierte a SQL nativo.',
    de_DE:
      'Aktualisiert LND auf 0.21.0-beta und stellt die Datenbank vom alten bolt-Backend auf SQLite um, wodurch der langsame Komprimierungsschritt beim Start entfällt. Die einmalige Konvertierung läuft beim ersten Start von LND nach der Aktualisierung automatisch und kann nicht rückgängig gemacht werden – sichern Sie Ihren Knoten vor der Aktualisierung. Schlägt sie fehl, startet LND nicht, sodass Sie es erneut versuchen können. Dieser erste Start kann eine Weile dauern, da LND auch auf natives SQL umstellt.',
    pl_PL:
      'Aktualizuje LND do 0.21.0-beta i przenosi bazę danych ze starego backendu bolt do SQLite, eliminując powolny etap kompaktowania przy starcie. Jednorazowa konwersja uruchamia się automatycznie przy pierwszym starcie LND po aktualizacji i nie można jej cofnąć — przed aktualizacją wykonaj kopię zapasową węzła. Jeśli się nie powiedzie, LND się nie uruchomi, więc będzie można spróbować ponownie. Ten pierwszy start może chwilę potrwać, ponieważ LND konwertuje też do natywnego SQL.',
    fr_FR:
      "Met à jour LND vers 0.21.0-beta et fait passer la base de données de l'ancien backend bolt à SQLite, supprimant la lente étape de compactage au démarrage. La conversion unique s'exécute automatiquement au premier démarrage de LND après la mise à jour et est irréversible — sauvegardez votre nœud avant de mettre à jour. En cas d'échec, LND ne démarrera pas, ce qui vous permet de réessayer. Ce premier démarrage peut prendre un certain temps, car LND convertit aussi vers le SQL natif.",
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
