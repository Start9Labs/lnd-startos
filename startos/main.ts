import { FileHelper } from '@start9labs/start-sdk'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { restPort } from './interfaces'
import { sdk } from './sdk'
import {
  bitcoindBundle,
  bitcoindMnt,
  GetInfo,
  lndDataDir,
  mainMounts,
  neutrinoBundle,
  sleep,
} from './utils'

export const main = sdk.setupMain(async ({ effects }) => {
  /**
   * ======================== Setup (optional) ========================
   */
  console.info(i18n('Starting LND!'))

  const store = await storeJson.read().const(effects)
  if (!store) {
    throw new Error('No store.json')
  }

  const conf = await lndConfFile.read().const(effects)
  if (!conf) {
    throw new Error('No lnd.conf')
  }

  const useBitcoind = conf['bitcoin.node'] === 'bitcoind'

  // Enforce backend bundle — ensures rpccookie, zmq, fee.url stay in sync
  await lndConfFile.merge(
    effects,
    useBitcoind ? bitcoindBundle : neutrinoBundle,
    { allowWriteAfterConst: true },
  )

  const {
    resetWalletTransactions,
    restore,
    walletPassword,
    watchtowerClients,
  } = store

  let mounts = mainMounts

  if (useBitcoind) {
    mounts = mounts.mountDependency({
      dependencyId: 'bitcoind',
      volumeId: 'main',
      mountpoint: bitcoindMnt,
      subpath: null,
      readonly: true,
    })
  }

  const lndSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mounts,
    'lnd-sub',
  )

  // Restart if Bitcoin .cookie changes
  if (useBitcoind) {
    await FileHelper.string(
      `${lndSub.rootfs}${bitcoindBundle['bitcoind.rpccookie']}`,
    )
      .read()
      .const(effects)
  }

  const lndArgs: string[] = []

  if (resetWalletTransactions) {
    lndArgs.push('--reset-wallet-transactions')
  }

  /**
   * ======================== Daemons ========================
   */
  return sdk.Daemons.of(effects)
    .addDaemon('lnd', {
      exec: { command: ['lnd', ...lndArgs] },
      subcontainer: lndSub,
      ready: {
        display: i18n('REST Interface'),
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, restPort, {
            successMessage: i18n(
              'The REST interface is ready to accept connections',
            ),
            errorMessage: i18n('The REST Interface is not ready'),
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
              `https://lnd.startos:${restPort}/v1/unlockwallet`,
              '-d',
              restore
                ? JSON.stringify({
                    wallet_password: base64.stringify(
                      Buffer.from(walletPassword),
                    ),
                    recovery_window: 2_500,
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
            await sleep(10_000)
          }
          return null
        },
      },
      subcontainer: lndSub,
      requires: ['lnd'],
    })
    .addHealthCheck('sync-progress', {
      ready: {
        display: i18n('Network and Graph Sync Progress'),
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
                message: i18n('Synced to chain and graph'),
                result: 'success',
              }
            } else if (!info.synced_to_chain && info.synced_to_graph) {
              return {
                message: i18n('Syncing to chain'),
                result: 'loading',
              }
            } else if (!info.synced_to_graph && info.synced_to_chain) {
              return {
                message: i18n('Syncing to graph'),
                result: 'loading',
              }
            }

            return {
              message: i18n('Syncing to graph and chain'),
              result: 'loading',
            }
          }

          if (
            res.stderr.includes(
              'rpc error: code = Unknown desc = waiting to start',
            )
          ) {
            return {
              message: i18n('LND is starting…'),
              result: 'starting',
            }
          }

          if (res.exitCode === null) {
            return {
              message: i18n('Syncing to graph'),
              result: 'loading',
            }
          }
          return {
            message: `Error: ${res.stderr as string}`,
            result: 'failure',
          }
        },
      },
      requires: ['lnd', 'unlock-wallet'],
    })
    .addOneshot('restore', () =>
      restore
        ? ({
            subcontainer: lndSub,
            exec: {
              fn: async () => {
                await sdk.setHealth(effects, {
                  id: 'restored',
                  name: i18n('Backup Restoration Detected'),
                  message: i18n(
                    'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.',
                  ),
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
            requires: ['lnd', 'unlock-wallet'],
          } as const)
        : null,
    )
    .addHealthCheck('reachability', () =>
      !conf.externalip?.length
        ? ({
            ready: {
              display: i18n('Node Reachability'),
              fn: () => ({
                result: 'disabled',
                message: i18n(
                  'Your node can peer with other nodes, but other nodes cannot peer with you. Optionally add a Tor domain, public domain, or public IP address to change this behavior.',
                ),
              }),
            },
            requires: ['lnd'],
          } as const)
        : null,
    )
    .addOneshot('add-watchtowers', () =>
      watchtowerClients.length > 0
        ? ({
            subcontainer: lndSub,
            exec: {
              fn: async (subcontainer: typeof lndSub, abort) => {
                // Setup watchtowers at runtime because for some reason they can't be setup in lnd.conf
                for (const tower of watchtowerClients || []) {
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
            requires: ['lnd', 'unlock-wallet', 'sync-progress'],
          } as const)
        : null,
    )
})
