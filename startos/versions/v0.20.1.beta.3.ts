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
      'Fix LND startup: the "LND Server" ready check now waits until the wallet unlocker endpoint is actually serving (past WAITING_TO_START), and the wallet-unlock oneshot polls LND\'s state machine and only POSTs /v1/unlockwallet when the wallet is in LOCKED. Prevents a hang where the oneshot skipped the unlock too early and LND stayed locked indefinitely.',
    es_ES:
      'Corrige el arranque de LND: la comprobación de preparación "LND Server" ahora espera hasta que el endpoint del wallet unlocker esté realmente sirviendo (pasado WAITING_TO_START), y la tarea de desbloqueo consulta la máquina de estados de LND y solo hace POST a /v1/unlockwallet cuando el wallet está en LOCKED. Evita un bloqueo en el que la tarea omitía el desbloqueo demasiado pronto y LND quedaba bloqueado indefinidamente.',
    de_DE:
      'Behebt den LND-Start: die Bereitschaftsprüfung "LND Server" wartet jetzt, bis der Wallet-Unlocker-Endpunkt tatsächlich bedient (hinter WAITING_TO_START), und der Wallet-Unlock-Oneshot fragt den LND-Zustandsautomaten ab und POSTet /v1/unlockwallet nur, wenn das Wallet in LOCKED ist. Verhindert ein Hängen, bei dem der Oneshot das Entsperren zu früh übersprang und LND dauerhaft gesperrt blieb.',
    pl_PL:
      'Poprawka startu LND: sprawdzanie gotowości "LND Server" czeka teraz, aż endpoint wallet unlocker faktycznie obsługuje żądania (poza WAITING_TO_START), a jednorazowe zadanie odblokowania odpytuje maszynę stanów LND i wysyła POST do /v1/unlockwallet tylko gdy portfel jest w stanie LOCKED. Zapobiega zawieszeniu, gdy zadanie pomijało odblokowanie zbyt wcześnie i LND pozostawał zablokowany.',
    fr_FR:
      "Corrige le démarrage de LND : le bilan de disponibilité « LND Server » attend désormais que l'endpoint du wallet unlocker serve réellement (au-delà de WAITING_TO_START), et le oneshot de déverrouillage interroge la machine à états de LND et n'envoie POST /v1/unlockwallet que lorsque le portefeuille est en LOCKED. Évite un blocage où le oneshot sautait le déverrouillage trop tôt et LND restait verrouillé indéfiniment.",
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
