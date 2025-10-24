import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'
import { readFile } from 'fs/promises'
import { storeJson } from '../../fileModels/store.json'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { lndConfDefaults, lndDataDir, mainMounts, sleep } from '../../utils'
import { base32, base64 } from 'rfc4648'
import { sdk } from '../../sdk'
import { restPort } from '../../interfaces'
import { load } from 'js-yaml'

export const v0_19_3_1_beta_1 = VersionInfo.of({
version: '0.19.3-beta:1-beta.1',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {
      const store = await storeJson.read().once()

      if (store) return // only run migration if store doesn't exist (heuristic for 0.3.5.1 migrations)

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

      try {
        await readFile('/media/startos/volumes/main/pwd.dat')
      } catch (error) {
        throw new Error(`Error opening pwd.dat: ${error}`)
      }

      const osIp = await sdk.getOsIp(effects)

      await lndConfFile.merge(effects, {
        'bitcoind.rpchost': lndConfDefaults['bitcoind.rpchost'],
        'bitcoind.rpcuser': undefined,
        'bitcoind.rpcpass': undefined,
        'bitcoind.zmqpubrawblock': lndConfDefaults['bitcoind.zmqpubrawblock'],
        'bitcoind.zmqpubrawtx': lndConfDefaults['bitcoind.zmqpubrawtx'],
        'bitcoind.rpccookie': lndConfDefaults['bitcoind.rpccookie'],
        'tor.socks': `${osIp}:9050`,
        rpclisten: lndConfDefaults.rpclisten,
        restlisten: lndConfDefaults.restlisten,
      })

      let walletPassword = ''
      const buffer = await readFile('/media/startos/volumes/main/pwd.dat')
      const decoded = buffer.toString('utf8')
      const reEncoded = Buffer.from(decoded, 'utf8')

      if (buffer.equals(reEncoded)) {
        console.log('pwd.dat is typeable')
        walletPassword = decoded
      } else {
        const node = await lndConfFile.read((e) => e['bitcoin.node']).once()

        let mounts = mainMounts
        if (node === 'bitcoind') {
          mounts = mounts.mountDependency({
            dependencyId: 'bitcoind',
            mountpoint: '/mnt/bitcoin',
            readonly: true,
            subpath: null,
            volumeId: 'main',
          })

          try {
            await effects.setDependencies({
              dependencies: [
                {
                  id: 'bitcoind',
                  kind: 'running',
                  versionRange: '>=29.1:2-beta.0',
                  healthChecks: ['primary'],
                },
              ],
            })
            const depResult = await sdk.checkDependencies(effects)

            depResult.throwIfRunningNotSatisfied('bitcoind')
            depResult.throwIfInstalledVersionNotSatisfied('bitcoind')
            depResult.throwIfTasksNotSatisfied('bitcoind')
            depResult.throwIfHealthNotSatisfied('bitcoind', 'primary')
          } catch (error) {
            console.log('Error: ', error)
            throw new Error(
              'Due to updating from a much older version of LND, Bitcoin must be updated and running before LND can be updated. After Bitcoin has been updated to the latest version, LND can be updated.',
            )
          }
        }

        const lndSub = await sdk.SubContainer.of(
          effects,
          { imageId: 'lnd' },
          mounts,
          'lnd-sub',
        )

        await sdk.Daemons.of(effects, async () => null)
          .addDaemon('primary', {
            exec: { command: ['lnd'] },
            subcontainer: lndSub,
            ready: {
              display: 'REST Interface',
              fn: () =>
                sdk.healthCheck.checkPortListening(effects, restPort, {
                  successMessage:
                    'The REST interface is ready to accept connections',
                  errorMessage: 'The REST Interface is not ready',
                }),
            },
            requires: [],
          })
          .addOneshot('changepassword', {
            exec: {
              fn: async (subcontainer, abort) => {
                while (true) {
                  if (abort.aborted) {
                    console.log('changepassword aborted')
                    break
                  }
                  try {
                    console.log('encoding pwd.dat to base32')

                    walletPassword = base32.stringify(buffer).replace(/=/g, '')
                    const current_password = base64.stringify(buffer)
                    const new_password = base64.stringify(
                      Buffer.from(walletPassword),
                    )

                    const res = await subcontainer.exec([
                      'curl',
                      '--no-progress-meter',
                      '-X',
                      'POST',
                      '--cacert',
                      `${lndDataDir}/tls.cert`,
                      'https://lnd.startos:8080/v1/changepassword',
                      '-d',
                      JSON.stringify({
                        current_password,
                        new_password,
                      }),
                    ])

                    if (res.stdout.includes('admin_macaroon')) {
                      console.log(
                        'Password successfully changed to from binary to base32',
                      )
                      break
                    }
                    sleep(10_000)
                  } catch (e) {
                    console.log(`Error running changepassword: `, e)
                  }
                }
                return null
              },
            },
            subcontainer: lndSub,
            requires: ['primary'],
          })
          .runUntilSuccess(120_000)
      }
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
        storeJson.merge(effects, {
          aezeedCipherSeed: existingSeed.length === 24 ? existingSeed : null,
          walletPassword: Buffer.from(walletPassword).toString('base64'),
          walletInitialized: !!walletPassword,
          bitcoindSelected: configYaml.bitcoind.type === 'internal',
          recoveryWindow: configYaml.advanced['recovery-window'] || 2_500,
          restore: false,
          resetWalletTransactions: false,
          watchtowers:
            configYaml.watchtowers['wt-client'].enabled === 'enabled'
              ? configYaml.watchtowers['wt-client']['add-watchtowers']
              : [],
          externalGateway: null,
          pendingPasswordChange: null,
          passwordChangeError: null,
          autoUnlockEnabled: true,
          seedBackupConfirmed: false,
          passwordBackupConfirmed: false,
            seedBackupIndices: null,
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