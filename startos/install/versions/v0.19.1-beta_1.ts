import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'
import { readFile } from 'fs/promises'
import { storeJson } from '../../fileModels/store.json'
import { load } from 'js-yaml'

export const v0_19_1_beta_1 = VersionInfo.of({
  version: '0.19.1-beta:1-alpha.2',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {
      let existingSeed: string[] = []
      try {
        await readFile(
          '/media/startos/volumes/main/start9/cipherSeedMnemonic.txt',
          'utf8',
        ).then((contents) => {
          contents
            .trimEnd()
            .split('\n')
            .forEach((line) => {
              const word = line.split(' ')[1]
              existingSeed.push(word)
            })
        })
      } catch (error) {
        console.log('CipherSeed not found')
      }

      let walletPassword = null
      try {
        const buffer = await readFile('/media/startos/volumes/main/pwd.dat')
        const decoded = buffer.toString('utf8')
        const reEncoded = Buffer.from(decoded, 'utf8')
        if (buffer.equals(reEncoded)) {
          console.log('pwd.dat is typeable')
          walletPassword = decoded
        } else {
          console.log('non-typeable data found in pwd.dat. Contact support.')
        }
      } catch (error) {
        throw new Error(`Error opening pwd.dat: ${error}`)
      }

      if (!walletPassword)
        throw new Error(
          'pwd.dat not found. Contact Start9 support.',
        )

      try {
        const configYaml = load(
          await readFile(
            '/media/startos/volumes/main/start9/config.yaml',
            'utf8',
          ),
        ) as {
          bitcoind: {
            type: string
          }
          watchtowers: {
            'wt-client':
              | { enabled: 'disabled' }
              | { enabled: 'enabled'; 'add-watchtowers': string[] }
          }
          advanced: {
            'recovery-window': number | null
          }
        }
        storeJson.write(effects, {
          aezeedCipherSeed: existingSeed.length === 24 ? existingSeed : null,
          walletPassword: walletPassword,
          walletInitialized: !!walletPassword,
          bitcoindSelected: configYaml.bitcoind.type === 'internal',
          recoveryWindow: configYaml.advanced['recovery-window'] || 2_500,
          restore: false,
          resetWalletTransactions: false,
          watchtowers:
            configYaml.watchtowers['wt-client'].enabled === 'enabled'
              ? configYaml.watchtowers['wt-client']['add-watchtowers']
              : [],
        })
      } catch (error) {
        console.log('config.yaml not found')
        throw new Error(
          'config.yaml not found. If LND was installed but never configured or run LND should be installed fresh.\nIf LND was configured/run prior to updating please contact Start9 support.',
        )
      }
    },
    down: IMPOSSIBLE,
  },
})

