import { FileHelper } from '@start9labs/start-sdk'
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest'
import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { storeJson } from './fileModels/store.json'
import { syncNotifiedFile } from './fileModels/syncNotified.json'
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

const certPath = '/media/startos/volumes/main/tls.cert'
/** Hit LND's /v1/state REST endpoint using the self-signed TLS cert. */
async function getLndState(): Promise<string | null> {
  const ca = await readFile(certPath).catch(() => null)
  return new Promise((resolve) => {
    const req = request(
      `https://lnd.startos:${restPort}/v1/state`,
      { ca: ca ?? undefined, rejectUnauthorized: !!ca, timeout: 5000 },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve((JSON.parse(data) as { state: string }).state)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}


export const main = sdk.setupMain(async ({ effects }) => {
  /**
   * ======================== Setup (optional) ========================
   */
  console.info(i18n('Starting LND!'))

  const store = await storeJson.read().const(effects)
  if (!store) {
    throw new Error('No store.json')
  }

  let notified = (await syncNotifiedFile.read().once())?.notified ?? false

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
    mounts = mounts.mountDependency<typeof bitcoinManifest>({
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
        display: i18n('LND Server'),
        fn: async () => {
          const lndState = await getLndState()
          // WAITING_TO_START (255) is earliest in the state machine — the
          // wallet unlocker sub-server isn't up yet, so don't let the
          // unlock-wallet oneshot fire. LOCKED onward means the unlocker
          // endpoint is serving.
          if (!lndState || lndState === 'WAITING_TO_START') {
            return { result: 'starting', message: null }
          }
          return { result: 'success', message: i18n('LND is ready') }
        },
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

            // Skip the unlock call (and its noisy LND error log) only when
            // the wallet is strictly past LOCKED. Per stateservice.proto:
            //   NON_EXISTING=0, LOCKED=1, UNLOCKED=2, RPC_ACTIVE=3,
            //   SERVER_ACTIVE=4, WAITING_TO_START=255.
            // WAITING_TO_START means "not started yet" — keep polling.
            const state = await getLndState()
            if (
              state === 'UNLOCKED' ||
              state === 'RPC_ACTIVE' ||
              state === 'SERVER_ACTIVE'
            ) {
              console.log(`wallet-unlock skipped, state=${state}`)
              break
            }
            if (state !== 'LOCKED') {
              // NON_EXISTING, WAITING_TO_START, or endpoint unreachable —
              // wallet unlocker isn't ready for a POST yet.
              await sleep(2_000)
              continue
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
                      Buffer.from(walletPassword, 'latin1'),
                    ),
                    recovery_window: 2_500,
                  })
                : JSON.stringify({
                    wallet_password: base64.stringify(
                      Buffer.from(walletPassword, 'latin1'),
                    ),
                  }),
            ])
            console.log('wallet-unlock response', res)
            const stdout = res.stdout.toString().trim()
            // `{}` = unlock succeeded. "wallet already unlocked" = wallet is
            // already past the LOCKED state (e.g. because /v1/state raced
            // with the oneshot). Both mean we're done.
            if (stdout === '{}' || stdout.includes('wallet already unlocked')) {
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
    .addOneshot('synced-true', {
      subcontainer: null,
      exec: {
        fn: async () => {
          // The SDK re-fires this oneshot every time sync-progress dips out
          // of success and recovers (graph re-sync, transient lncli errors).
          // The closure flag is the source of truth within a main lifecycle;
          // the on-disk flag re-seeds it on next startup.
          if (!notified) {
            await sdk.notification.create(effects, {
              level: 'success',
              title: i18n('Sync Complete'),
              message: i18n('LND is synced to chain and graph.'),
            })
            await syncNotifiedFile.write(effects, { notified: true })
            notified = true
          }
          return null
        },
      },
      requires: ['sync-progress'],
    })
    .addOneshot('restore', () =>
      restore
        ? {
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
          }
        : null,
    )
    .addHealthCheck('reachability', () =>
      !conf.externalip?.length && !conf.externalhosts?.length
        ? {
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
          }
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
