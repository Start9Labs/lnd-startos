import { FileHelper } from '@start9labs/start-sdk'
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest'
import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { base64 } from 'rfc4648'
import { lndConfFile } from './fileModels/lnd.conf'
import { startupFlagsJson } from './fileModels/startupFlags.json'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { restPort } from './interfaces'
import { sdk } from './sdk'
import {
  needsSqliteMigration,
  runSqliteMigration,
  sqliteMigrationComplete,
} from './sqliteBackend'
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

  // One-time startup flags live outside store.json — read with `.once`, not the
  // `.const` watch above — so flipping them back after startup doesn't restart
  // main. The action that sets resetWalletTransactions restarts LND itself via
  // sdk.restart; here we only consume and then clear.
  const startupFlags = await startupFlagsJson.read().once()
  if (!startupFlags) {
    throw new Error('No startup-flags.json')
  }
  const { resetWalletTransactions, restore } = startupFlags
  let notified = startupFlags.notified

  const conf = await lndConfFile.read().const(effects)
  if (!conf) {
    throw new Error('No lnd.conf')
  }

  const useBitcoind = conf['bitcoin.node'] === 'bitcoind'

  // Enforce backend bundle — ensures rpccookie, zmq, fee.url stay in sync. This
  // write also re-renders the conf through the file-model schema, which forces
  // db.use-native-sql (CLI-only now) and the obsolete onion-message keys
  // (custom-init/nodeann/message — bit 39 crashes on 0.21, see lnd.conf.ts) to
  // undefined, stripping any an upgraded node still carries.
  await lndConfFile.merge(
    effects,
    useBitcoind ? bitcoindBundle : neutrinoBundle,
    { allowWriteAfterConst: true },
  )

  const { walletPassword, watchtowerClients } = store

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

  // Native SQL lives on the CLI, not the conf (see lnd.conf.ts).
  const lndArgs: string[] = ['--db.use-native-sql']

  if (resetWalletTransactions) {
    lndArgs.push('--reset-wallet-transactions')
  }

  /**
   * ======================== Daemons ========================
   */
  // Decided up front so the migrate-sqlite oneshot and its health check exist
  // ONLY on a run that actually migrates — on every later start they are absent
  // entirely (function form returns null below).
  const needMigration = await needsSqliteMigration()

  return sdk.Daemons.of(effects)
    .addOneshot('migrate-sqlite', () =>
      needMigration
        ? {
            // Convert the database to SQLite before LND starts. Runs in the
            // shared lndSub (spawns lnd + lndinit there). Writes only
            // startup-flags, so completing it never restarts main. Throws on
            // failure, so the lnd daemon (which requires it) won't start until a
            // retry succeeds; the work is resumable.
            subcontainer: lndSub,
            exec: {
              fn: async (sub, abort) => {
                await runSqliteMigration(effects, sub, abort)
                return null
              },
            },
            requires: [],
          }
        : null,
    )
    .addHealthCheck('db-migration', () =>
      needMigration
        ? {
            ready: {
              display: i18n('Database Migration'),
              // `starting` must be short: before the first result the trigger
              // waits `intervals.starting ?? defaultMs` and only then runs the
              // check (statusTrigger sleeps before its first fire). Without a
              // `starting` override the first poll is delayed by the 10-min
              // default, so the whole migration runs while the UI shows the
              // framework's default "starting" instead of our loading message.
              // `loading` then keeps polling every 2s so the display flips to
              // "complete" within ~2s of the oneshot finishing; after success it
              // backs off to the 10-min default. The lnd daemon gates on the
              // oneshot itself, not this check, so this only affects status
              // latency.
              trigger: sdk.trigger.statusTrigger(600_000, {
                starting: 2_000,
                loading: 2_000,
              }),
              fn: async () => {
                if (await sqliteMigrationComplete()) {
                  return {
                    result: 'success',
                    message: i18n('SQLite migration complete'),
                  }
                }
                return {
                  result: 'loading',
                  message: i18n(
                    'Migrating the database to SQLite. This can take several minutes — do not interrupt LND.',
                  ),
                }
              },
            },
            requires: [],
          }
        : null,
    )
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
      requires: needMigration ? ['migrate-sqlite'] : [],
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
    .addOneshot('clear-reset-flag', () =>
      // `--reset-wallet-transactions` is consumed once, when LND opens the
      // wallet at unlock. Now that unlock-wallet has completed the reset has
      // been applied, so clear the flag — otherwise it stays true and re-adds
      // the flag on every subsequent restart. The flag lives outside store.json
      // (read with `.once`), so this write does NOT trip a const watch and
      // restart main.
      resetWalletTransactions
        ? {
            subcontainer: null,
            exec: {
              fn: async () => {
                await startupFlagsJson.merge(effects, {
                  resetWalletTransactions: false,
                })
                return null
              },
            },
            requires: ['unlock-wallet'],
          }
        : null,
    )
    .addHealthCheck('sync-progress', {
      ready: {
        display: i18n('Network and Graph Sync Progress'),
        fn: async () => {
          let res
          try {
            res = await lndSub.exec(
              ['lncli', '--rpcserver=lnd.startos', 'getinfo'],
              {},
              30_000,
            )
          } catch {
            // The LND subcontainer can be momentarily absent while main is
            // re-running (e.g. Bitcoin Core's .cookie rotates on its restart,
            // which tears down lnd-sub to rebuild it). With no PID 1 in the
            // subcontainer, exec can't join its namespaces and throws a
            // filesystem I/O error (".../proc/1/ns/pid: No such file or
            // directory") instead of returning a result. Treat that as "still
            // coming up" — the lnd daemon's own `ready` check reflects a
            // genuine crash separately.
            return { message: i18n('LND is starting…'), result: 'starting' }
          }
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

          // `lncli getinfo` only succeeds once LND's RPC server is fully
          // active, so any non-zero (or null) exit here means LND is still
          // coming up — e.g. the wallet isn't unlocked yet, or the RPC server
          // reports "waiting to start" / "the RPC server is in the process of
          // starting up". That exact wording varies by LND version, so rather
          // than match a fixed string (the old check pinned "waiting to start"
          // and missed 0.20's phrasing, surfacing hundreds of spurious
          // failures per boot) we treat every non-success as a transient
          // startup state. A genuine crash/outage is owned by the lnd daemon's
          // `ready` check and the LND Server (/v1/state) health check.
          return {
            message: i18n('LND is starting…'),
            result: 'starting',
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
            await startupFlagsJson.merge(effects, { notified: true })
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
    .addOneshot('clear-restore-flag', () =>
      // Clear the restore flag once restorechanbackup has run, so it isn't
      // re-run on every restart. `requires: ['restore']` gates this on that
      // oneshot completing successfully — if restorechanbackup fails the flag
      // stays set and the restore is retried on the next startup. The flag
      // lives outside store.json (read with `.once`), so clearing it doesn't
      // trip a const watch and restart main.
      restore
        ? {
            subcontainer: null,
            exec: {
              fn: async () => {
                await startupFlagsJson.merge(effects, { restore: false })
                return null
              },
            },
            requires: ['restore'],
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
