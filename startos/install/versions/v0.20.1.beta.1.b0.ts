import { IMPOSSIBLE, VersionInfo, YAML } from '@start9labs/start-sdk'
import { readFile, rm } from 'fs/promises'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'

export const v_0_20_1_beta_1_b0 = VersionInfo.of({
  version: '0.20.1-beta:1-beta.0',
  releaseNotes: {
    en_US: 'Update to StartOS SDK beta.59',
    es_ES: 'Actualización a StartOS SDK beta.59',
    de_DE: 'Update auf StartOS SDK beta.59',
    pl_PL: 'Aktualizacja do StartOS SDK beta.59',
    fr_FR: "Ajout du support de migration StartOS pour l'action Initialiser le portefeuille",
  },
  migrations: {
    up: async ({ effects }) => {
      // Try to read the old 0.3.5.x config. If it exists, we're migrating
      // from 0.3.5.x and need to carry over settings to the new store format.
      const configYaml:
        | {
            watchtowers: {
              'wt-client':
                | { enabled: 'disabled' }
                | { enabled: 'enabled'; 'add-watchtowers': string[] }
            }
          }
        | undefined = await readFile(
        '/media/startos/volumes/main/start9/config.yaml',
        'utf-8',
      ).then(YAML.parse, () => undefined)

      if (configYaml) {
        await storeJson.merge(effects, {
          // The seed file uses "N word" format, one per line. Not all
          // installations have one, so fall back to null.
          aezeedCipherSeed: await readFile(
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
          ),
          // Only store the password if it's valid UTF-8. Some old
          // installations have a binary pwd.dat, which is preserved
          // on disk for manual recovery if needed.
          walletPassword: await readFile(
            '/media/startos/volumes/main/pwd.dat',
          ).then((buf) => {
            const decoded = buf.toString('utf8')
            return buf.equals(Buffer.from(decoded, 'utf8')) ? decoded : ''
          }),
          watchtowerClients:
            configYaml.watchtowers['wt-client'].enabled === 'enabled'
              ? configYaml.watchtowers['wt-client']['add-watchtowers']
              : [],
        })

        await rm('/media/startos/volumes/main/start9', {
          recursive: true,
        }).catch(console.error)
      } else {
        // Already migrated — initialize store with defaults.
        await storeJson.merge(effects, {})
      }

      // Read-then-write to trigger zod coercion
      await lndConfFile.merge(effects, {})
    },
    down: IMPOSSIBLE,
  },
})
