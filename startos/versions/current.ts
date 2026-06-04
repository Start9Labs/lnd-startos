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
  version: '0.20.1-beta:12',
  releaseNotes: {
    en_US:
      'Adds a hidden **Auto-Configure** action that lets a dependent service request specific lnd.conf settings through a one-click task. The first use is enabling onion messages for BOLT12 offers (e.g. BOLT12 Pay / LNDK).',
    es_ES:
      'Añade una acción oculta **Configuración automática** que permite a un servicio dependiente solicitar ajustes específicos de lnd.conf mediante una tarea de un solo clic. Su primer uso es habilitar los mensajes onion para las ofertas BOLT12 (por ejemplo, BOLT12 Pay / LNDK).',
    de_DE:
      'Fügt eine versteckte Aktion **Automatisch konfigurieren** hinzu, mit der ein abhängiger Dienst bestimmte lnd.conf-Einstellungen über eine Ein-Klick-Aufgabe anfordern kann. Der erste Anwendungsfall ist das Aktivieren von Onion-Nachrichten für BOLT12-Angebote (z. B. BOLT12 Pay / LNDK).',
    pl_PL:
      'Dodaje ukrytą akcję **Automatyczna konfiguracja**, która pozwala usłudze zależnej zażądać określonych ustawień lnd.conf za pomocą zadania jednym kliknięciem. Pierwszym zastosowaniem jest włączenie wiadomości onion dla ofert BOLT12 (np. BOLT12 Pay / LNDK).',
    fr_FR:
      "Ajoute une action masquée **Configuration automatique** qui permet à un service dépendant de demander des paramètres lnd.conf spécifiques via une tâche en un clic. Le premier usage est l'activation des messages onion pour les offres BOLT12 (par exemple BOLT12 Pay / LNDK).",
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
