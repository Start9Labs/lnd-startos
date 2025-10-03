import { sdk } from './sdk'
import { FileHelper } from '@start9labs/start-sdk'
import {
  GetInfo,
  lndConfDefaults,
  lndDataDir,
  mainMounts,
  sleep,
} from './utils'
import { restPort } from './interfaces'
import { lndConfFile } from './fileModels/lnd.conf'
import { manifest } from './manifest'
import { storeJson } from './fileModels/store.json'
import { Effects, SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import { Mounts } from '@start9labs/start-sdk/package/lib/mainFn/Mounts'
import { base64 } from 'rfc4648'

export const main = sdk.setupMain(async ({ effects, started }) => {
  /**
   * ======================== Setup (optional) ========================
   */
  console.log('Starting LND!')

  const {
    recoveryWindow,
    resetWalletTransactions,
    restore,
    walletInitialized,
    walletPassword,
    watchtowers,
  } = (await storeJson.read().once())!

  const conf = (await lndConfFile.read().const(effects))!

  let mounts = mainMounts

  if (conf['bitcoin.node'] === 'bitcoind') {
    mounts = mounts.mountDependency({
      dependencyId: 'bitcoind',
      mountpoint: '/mnt/bitcoin',
      readonly: true,
      subpath: null,
      volumeId: 'main',
    })
    const depResult = await sdk.checkDependencies(effects)
    depResult.throwIfRunningNotSatisfied('bitcoind')
    depResult.throwIfInstalledVersionNotSatisfied('bitcoind')
    depResult.throwIfTasksNotSatisfied('bitcoind')
    depResult.throwIfHealthNotSatisfied('bitcoind', 'primary')
  }

  if (!walletInitialized) {
    console.log('Fresh install detected. Initializing LND wallet')
    await initializeLnd(effects, mounts)
    await storeJson.merge(effects, { walletInitialized: true })
  }

  // Restart on storeJson changes
  await storeJson.read().const(effects)

  const osIp = await sdk.getOsIp(effects)

  if (
    ![conf.rpclisten].flat()?.includes(lndConfDefaults.rpclisten) ||
    ![conf.restlisten].flat()?.includes(lndConfDefaults.restlisten) ||
    conf['tor.socks'] !== `${osIp}:9050`
  ) {
    await lndConfFile.merge(
      effects,
      {
        'tor.socks': `${osIp}:9050`,
        rpclisten: conf.rpclisten
          ? [
              ...new Set(
                [[conf.rpclisten].flat(), lndConfDefaults.rpclisten].flat(),
              ),
            ]
          : lndConfDefaults.rpclisten,
        restlisten: conf.restlisten
          ? [
              ...new Set(
                [[conf.restlisten].flat(), lndConfDefaults.restlisten].flat(),
              ),
            ]
          : lndConfDefaults.restlisten,
      },
      { allowWriteAfterConst: true },
    )
  }

  const lndArgs: string[] = []

  if (resetWalletTransactions) lndArgs.push('--reset-wallet-transactions')

  const lndSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mounts,
    'lnd-sub',
  )

  // Restart if Bitcoin .cookie changes if using bitcoin backend
  if (conf['bitcoin.node'] === 'bitcoind') {
    await FileHelper.string(`${lndSub.rootfs}/mnt/bitcoin/.cookie`)
      .read()
      .const(effects)
  }

  /**
   * ======================== Daemons ========================
   */
  return sdk.Daemons.of(effects, started)
    .addDaemon('primary', {
      exec: { command: ['lnd', ...lndArgs] },
      subcontainer: lndSub,
      ready: {
        display: 'REST Interface',
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, restPort, {
            successMessage: 'The REST interface is ready to accept connections',
            errorMessage: 'The REST Interface is not ready',
          }),
      },
      requires: [],
    })
    .addOneshot('unlock-wallet', {
      exec: {
        fn: async (subcontainer, abort) => {
          while (true) {
            if (abort.aborted) {
              console.log('wallet-unlock aborted')
              break
            }

            if (!walletPassword)
              throw new Error('Wallet Password is undefined!')

            const res = await subcontainer.exec([
              'curl',
              '--no-progress-meter',
              '-X',
              'POST',
              '--cacert',
              `${lndDataDir}/tls.cert`,
              'https://lnd.startos:8080/v1/unlockwallet',
              '-d',
              restore
                ? JSON.stringify({
                    wallet_password: base64.stringify(
                      Buffer.from(walletPassword),
                    ),
                    recovery_window: recoveryWindow,
                  })
                : JSON.stringify({
                    wallet_password: base64.stringify(
                      Buffer.from(walletPassword),
                    ),
                  }),
            ])
            console.log('wallet-unlock response', res)
            if (res.stdout === '{}') {
              break
            }
            sleep(10_000)
          }
          return null
        },
      },
      subcontainer: lndSub,
      requires: ['primary'],
    })
    .addHealthCheck('sync-progress', {
      requires: ['primary', 'unlock-wallet'],
      ready: {
        display: 'Network and Graph Sync Progress',
        fn: async () => {
          const res = await lndSub.exec(
            ['lncli', '--rpcserver=lnd.startos', 'getinfo'],
            {},
            30_000,
          )
          if (
            res.exitCode === 0 &&
            res.stdout !== '' &&
            typeof res.stdout === 'string'
          ) {
            const info: GetInfo = JSON.parse(res.stdout)

            if (info.synced_to_chain && info.synced_to_graph) {
              return {
                message: 'Synced to chain and graph',
                result: 'success',
              }
            } else if (!info.synced_to_chain && info.synced_to_graph) {
              return {
                message: 'Syncing to chain',
                result: 'loading',
              }
            } else if (!info.synced_to_graph && info.synced_to_chain) {
              return {
                message: 'Syncing to graph',
                result: 'loading',
              }
            }

            return {
              message: 'Syncing to graph and chain',
              result: 'loading',
            }
          }

          if (
            res.stderr.includes(
              'rpc error: code = Unknown desc = waiting to start',
            )
          ) {
            return {
              message: 'LND is starting…',
              result: 'starting',
            }
          }

          if (res.exitCode === null) {
            return {
              message: 'Syncing to graph',
              result: 'loading',
            }
          }
          return {
            message: `Error: ${res.stderr as string}`,
            result: 'failure',
          }
        },
      },
    })
    .addOneshot('restore', () =>
      restore
        ? ({
            subcontainer: lndSub,
            exec: {
              fn: async () => {
                await sdk.setHealth(effects, {
                  id: 'restored',
                  name: 'Backup Restoration Detected',
                  message:
                    'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.',
                  result: 'failure',
                })
                return {
                  command: [
                    'lncli',
                    '--rpcserver=lnd.startos',
                    'restorechanbackup',
                    '--multi_file',
                    `${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup`,
                  ],
                }
              },
            },
            requires: ['primary', 'unlock-wallet'],
          } as const)
        : null,
    )
    .addHealthCheck('reachability', () =>
      !conf.externalip && !conf.externalhosts?.length
        ? ({
            ready: {
              display: 'Node Reachability',
              fn: () => ({
                result: 'disabled',
                message:
                  'Your node can peer with other nodes, but other nodes cannot peer with you. Optionally add a Tor domain, public domain, or public IP address to change this behavior.',
              }),
            },
            requires: ['primary'],
          } as const)
        : null,
    )
    .addOneshot('add-watchtowers', () =>
      watchtowers.length > 0
        ? ({
            subcontainer: lndSub,
            exec: {
              fn: async (subcontainer: typeof lndSub, abort) => {
                // Setup watchtowers at runtime because for some reason they can't be setup in lnd.conf
                for (const tower of watchtowers || []) {
                  if (abort.aborted) break
                  console.log(`Watchtower client adding ${tower}`)
                  let res = await subcontainer.exec(
                    [
                      'lncli',
                      '--rpcserver=lnd.startos',
                      'wtclient',
                      'add',
                      tower,
                    ],
                    undefined,
                    undefined,
                    {
                      abort: abort.reason,
                      signal: abort,
                    },
                  )

                  if (
                    res.exitCode === 0 &&
                    res.stdout !== '' &&
                    typeof res.stdout === 'string'
                  ) {
                    console.log(`Result adding tower ${tower}: ${res.stdout}`)
                  } else {
                    console.log(`Error adding tower ${tower}: ${res.stderr}`)
                  }
                }
                return null
              },
            },
            requires: ['primary', 'unlock-wallet', 'sync-progress'],
          } as const)
        : null,
    )
})

async function initializeLnd(
  effects: Effects,
  mounts: Mounts<typeof manifest>,
) {
  await sdk.SubContainer.withTemp(
    effects,
    {
      imageId: 'lnd',
    },
    mounts,
    'initialize-lnd',
    async (subc) => {
      const child = await subc.spawn(['lnd'])

      let cipherSeed: string[] = []
      do {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          'GET',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          '--fail-with-body',
          'https://lnd.startos:8080/v1/genseed',
        ])
        if (
          res.exitCode === 0 &&
          res.stdout !== '' &&
          typeof res.stdout === 'string'
        ) {
          cipherSeed = JSON.parse(res.stdout)['cipher_seed_mnemonic']
          break
        } else {
          console.log('Waiting for RPC to start...')
          await sleep(5_000)
        }
      } while (true)

      const walletPassword = (await storeJson.read().once())?.walletPassword
      if (!walletPassword) throw new Error('No wallet password found')

      const status = await subc.exec([
        'curl',
        '--no-progress-meter',
        '-X',
        'POST',
        '--cacert',
        `${lndDataDir}/tls.cert`,
        '--fail-with-body',
        'https://lnd.startos:8080/v1/initwallet',
        '-d',
        `${JSON.stringify({
          wallet_password: base64.stringify(Buffer.from(walletPassword)),
          cipher_seed_mnemonic: cipherSeed,
        })}`,
      ])

      if (status.stderr !== '' && typeof status.stderr === 'string') {
        console.log(`Error running initwallet: ${status.stderr}`)
      }

      await storeJson.merge(effects, { aezeedCipherSeed: cipherSeed })

      child.kill(SIGTERM)
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 60_000)
      })
    },
  )
}
