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

export const v_0_20_1_beta_3 = VersionInfo.of({
  version: '0.20.1-beta:3',
  releaseNotes: {
    en_US:
      'Fix a hang on update where the wallet-unlock oneshot could loop forever if LND reported "wallet already unlocked", blocking sync-progress and every dependent oneshot. The oneshot now checks /v1/state first and treats "already unlocked" as success.',
    es_ES:
      'Corrige un bloqueo durante la actualización en el que la tarea de desbloqueo de wallet podía repetirse indefinidamente si LND respondía "wallet already unlocked", dejando bloqueados el progreso de sincronización y todas las tareas dependientes. Ahora la tarea consulta /v1/state primero y trata "already unlocked" como éxito.',
    de_DE:
      'Behebt ein Hängen beim Update, bei dem der Wallet-Unlock-Oneshot in einer Endlosschleife lief, wenn LND "wallet already unlocked" meldete, und damit den Sync-Progress sowie alle abhängigen Oneshots blockierte. Der Oneshot prüft jetzt zuerst /v1/state und behandelt "already unlocked" als Erfolg.',
    pl_PL:
      'Poprawka zawieszania podczas aktualizacji, gdzie jednorazowe zadanie odblokowania portfela mogło pętlać się bez końca, jeśli LND zgłosił "wallet already unlocked", blokując postęp synchronizacji i wszystkie zależne zadania. Zadanie najpierw sprawdza /v1/state i traktuje "already unlocked" jako sukces.',
    fr_FR:
      "Corrige un blocage lors de la mise à jour où le oneshot de déverrouillage du portefeuille pouvait boucler indéfiniment si LND renvoyait « wallet already unlocked », bloquant la progression de la synchronisation et tous les oneshots dépendants. Le oneshot interroge désormais d'abord /v1/state et traite « already unlocked » comme un succès.",
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
