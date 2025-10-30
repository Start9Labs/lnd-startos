import { VersionInfo, IMPOSSIBLE } from '@start9labs/start-sdk'
import { readFile } from 'fs/promises'
import { storeJson } from '../../fileModels/store.json'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { lndConfDefaults, lndDataDir, mainMounts, sleep } from '../../utils'
import { base64 } from 'rfc4648'
import { sdk } from '../../sdk'
import { restPort } from '../../interfaces'

export const v0_19_3_1_beta_1 = VersionInfo.of({
  version: '0.19.3-beta:1-beta.1',
  releaseNotes: 'Revamped for StartOS 0.4.0',
  migrations: {
    up: async ({ effects }) => {
      const walletPassword = await storeJson
        .read((e) => e.walletPassword)
        .once()

      if (!walletPassword) return

      try {
        await readFile('/media/startos/volumes/main/pwd.dat')
        return
      } catch (error) {
        console.log('No pwd.dat found')
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
            'Bitcoin must be updated and running before LND can be updated.',
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
                      current_password: walletPassword,
                      new_password,
                    }),
                  ])

                  if (res.stdout.includes('admin_macaroon')) {
                    console.log('Password successfully changed to base64')
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
    },
    down: IMPOSSIBLE,
  },
})
