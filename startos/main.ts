import { FileHelper, utils } from '@start9labs/start-sdk'
import { manifest as bitcoinManifest } from 'bitcoin-core-startos/startos/manifest'
import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { base64 } from 'rfc4648'
import { initializeWallet } from './actions/initializeWallet'
import { manualWalletUnlock } from './actions/walletPassword'
import { customConfigJson } from './fileModels/custom-config.json'
import { lndConfFile } from './fileModels/lnd.conf'
import { ImportPending, startupFlagsJson } from './fileModels/startupFlags.json'
import { shape, storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { migrateOnStart, needsSqliteMigration } from './sqliteBackend'
import {
  bitcoindMnt,
  getBitcoindBundle,
  GetInfo,
  lndDataDir,
  mainMounts,
  neutrinoBundle,
  selfGrpcHost,
  selfRestUrl,
  sleep,
} from './utils'

const certPath = '/media/startos/volumes/main/tls.cert'

// Bounded by the channel db an origin node hands over — multi-GB on a busy
// routing node, off a USB disk, over LAN. The SDK's 30 s exec default would
// SIGKILL the copy long before it finished.
const IMPORT_TIMEOUT_MS = 6 * 60 * 60_000

// Well past the observed 36 s – 2 m 37 s a healthy node takes to reach
// synced_to_graph, so crossing it means the elected peer is not answering.
const GRAPH_SYNC_SLOW_MS = 15 * 60_000

// How long the wallet must stay LOCKED before wallet-status reports it as a
// genuinely locked wallet rather than the brief stopping point on the way to a
// correct auto-unlock password. Well past the couple of seconds that takes.
const WALLET_LOCKED_GRACE_MS = 10_000

// LND gates synced_to_graph on one elected peer, and holds every other peer
// passive until it finishes — so one unresponsive peer stalls all gossip, and
// from getinfo alone that looks identical to a large backfill. Elapsed time is
// what separates them.
function graphSyncMessage(info: GetInfo, pendingSince: number | null) {
  if (info.num_peers === 0) {
    return i18n('Waiting for peers')
  }

  const elapsed = pendingSince === null ? 0 : Date.now() - pendingSince
  if (elapsed < GRAPH_SYNC_SLOW_MS) {
    return i18n('Syncing to graph')
  }

  return i18n(
    'Graph sync has not completed in ${minutes} min (peers: ${peers}). LND retries with another peer every hour.',
    { minutes: Math.floor(elapsed / 60_000), peers: info.num_peers },
  )
}

/** Hit LND's /v1/state REST endpoint on loopback using its TLS cert. */
async function getLndState(): Promise<string | null> {
  const ca = await readFile(certPath).catch(() => null)
  return new Promise((resolve) => {
    const req = request(
      `${selfRestUrl}/v1/state`,
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
  const { resetWalletTransactions, restore, rotateMacaroonRootKey } =
    startupFlags
  let notified = startupFlags.notified
  let graphSyncPendingSince: number | null = null
  let walletLockedSince: number | null = null

  const conf = await lndConfFile.read().const(effects)
  if (!conf) {
    throw new Error('No lnd.conf')
  }

  const useBitcoind = conf['bitcoin.node'] === 'bitcoind'

  const bitcoindSettings = useBitcoind
    ? await getBitcoindBundle(effects)
    : neutrinoBundle

  // Enforce backend bundle — ensures rpchost, rpccookie, zmq, fee.url stay in
  // sync. This write also re-renders the conf through the file-model schema,
  // which forces db.use-native-sql (CLI-only now) and the obsolete onion-message
  // keys (custom-init/nodeann/message — bit 39 crashes on 0.21, see lnd.conf.ts)
  // to undefined, stripping any an upgraded node still carries.
  await lndConfFile.merge(effects, bitcoindSettings, {
    allowWriteAfterConst: true,
  })

  const {
    walletPassword,
    watchtowerClients,
    autoUnlockEnabled,
    pendingPasswordChange,
  } = store

  // With auto-unlock disabled the wallet stays locked after a restart, so
  // surface a task that leads the user to the manual unlock action. Important
  // (like the initialize-wallet task) because a locked wallet means no channel
  // operations until it is unlocked.
  if (!autoUnlockEnabled && store.walletInitialized) {
    await sdk.action
      .createOwnTask(effects, manualWalletUnlock, 'important', {
        reason:
          'LND wallet is locked and auto-unlock is disabled. Use the "Wallet - Manual Unlock" action to provide your password.',
      })
      .catch((err) =>
        console.error(
          'failed to create the manual-unlock task',
          utils.asError(err).message,
        ),
      )
  }

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

  const lndSub = sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mounts,
    'lnd-sub',
  )

  // Restart only when bitcoind writes a replacement cookie — an absent cookie
  // means bitcoind is down, and stopping LND then hangs its shutdown.
  if (useBitcoind) {
    await FileHelper.string(`${await lndSub.rootfs}${bitcoindMnt}/.cookie`)
      .read(
        (cookie) => cookie,
        (prev, next) => next === null || prev === next,
      )
      .const(effects)
  }

  // LND reads its TLS pair once at startup, so re-running main is what carries
  // a reissued certificate — a new address on the gRPC interface — to a client.
  // Not armed ahead of a preparatory phase, which a re-run would abandon.
  if (!startupFlags.importPending && !(await needsSqliteMigration())) {
    await FileHelper.string(certPath).read().const(effects)
  }

  // Native SQL lives on the CLI, not the conf (see lnd.conf.ts).
  const lndArgs: string[] = ['--db.use-native-sql']

  if (resetWalletTransactions) {
    lndArgs.push('--reset-wallet-transactions')
  }

  /**
   * ======================== Daemons ========================
   *
   * Three chains, one at a time, swapped by the reconciler: import → bolt →
   * SQLite conversion → LND. Each is returned from the `Daemons.dynamic`
   * builder below, whose `.const()` reads are its swap triggers — a change to
   * one of them re-runs the builder and reconciles the difference, without
   * restarting main.
   *
   * Both preparatory phases have to live here rather than ahead of the chain:
   * an action is capped at 120 s by StartOS, and awaiting hours of work inside
   * `setupMain` would leave the service stuck on "starting" with no health
   * checks, no logs of its own, and no way to stop it. As phases they report
   * progress through health checks and the service is running throughout.
   */

  /**
   * Run `assets/import-<source>.sh`, which stops LND on the origin node, copies
   * its data directory into the main volume, and leaves the origin's wallet
   * password at /tmp/old-store.json for us to adopt. Scheduled by the Initialize
   * Wallet action, which has already verified these credentials work.
   */
  const importChain = (source: ImportPending['source']) => {
    const name = i18n('Wallet Import')
    // Consecutive failures within this chain's lifetime — the oneshot's fn
    // re-runs on retry, but this closure is built once per reconcile.
    let failures = 0

    return sdk.Daemons.of(effects).addOneshot('import', {
      subcontainer: sdk.SubContainer.of(
        effects,
        { imageId: 'lnd' },
        mainMounts.mountAssets({ subpath: null, mountpoint: '/scripts' }),
        `import-${source}`,
      ),
      exec: {
        fn: async (subcontainer, abort) => {
          try {
            // Read the pending import here, not in the builder above: the
            // reconciler's configHash cannot see fn closures, so when only the
            // credentials change (corrected via a fresh Initialize Wallet run)
            // the rebuilt chain diffs to "leave alone" and the running daemon
            // survives — this re-read on each retry is what picks the new
            // credentials up.
            const pending = await startupFlagsJson
              .read((f) => f.importPending)
              .once()
            if (!pending) return null
            const { label, env } = {
              umbrel: {
                label: 'Umbrel',
                env: {
                  UMBREL_HOST: pending.host,
                  UMBREL_PASS: pending.password,
                },
              },
              mynode: {
                label: 'myNode',
                env: {
                  MYNODE_HOST: pending.host,
                  MYNODE_PASS: pending.password,
                },
              },
              startos: {
                label: 'StartOS',
                env: {
                  STARTOS_HOST: pending.host,
                  STARTOS_PASS: pending.password,
                },
              },
            }[pending.source]
            await sdk.setHealth(effects, {
              id: 'import',
              name,
              result: 'loading',
              message: i18n(
                'Importing LND data from ${source}. Stopping the origin node and copying its data can take hours on a large node.',
                { source: label },
              ),
            })

            // Hand the abort signal to the copy: a stop leaves this fn running
            // until it returns, so without it stopping the service would wait
            // out the whole transfer. A killed copy is safe to repeat — the
            // pending flag is still set and the origin is not released until
            // the script's last step.
            const res = await subcontainer.exec(
              ['sh', `/scripts/import-${pending.source}.sh`],
              { env },
              IMPORT_TIMEOUT_MS,
              { abort: abort.reason, signal: abort },
            )
            if (res.exitCode !== 0) {
              const stderr = String(res.stderr)
                .trim()
                .split('\n')
                .slice(-3)
                .join(' ')
              throw new Error(`Import from ${label} failed: ${stderr}`)
            }

            const dump = await subcontainer.exec(['cat', '/tmp/old-store.json'])
            const oldStore =
              dump.exitCode === 0 && typeof dump.stdout === 'string'
                ? shape.safeParse(JSON.parse(dump.stdout))
                : null
            if (!oldStore?.success || !oldStore.data.walletPassword) {
              throw new Error(
                i18n(
                  'Failed to read the wallet password from the origin node.',
                ),
              )
            }

            // Adopt the origin's password before clearing the flag. An
            // interruption between the two only repeats the import; the reverse
            // order could leave imported data behind with no password that
            // opens it, which is what the conversion phase then fails on.
            //
            // store.json is `.const`-watched above, so this write does restart
            // main — allowWriteAfterConst only suppresses the write's own guard
            // (fileHelper.ts), not the watch. The teardown that follows aborts
            // this fn's signal but awaits its promise, so the two writes below
            // still land and the restarted main opens on the conversion phase.
            await storeJson.merge(
              effects,
              {
                walletPassword: oldStore.data.walletPassword,
                walletInitialized: true,
              },
              { allowWriteAfterConst: true },
            )

            await sdk.setHealth(effects, {
              id: 'import',
              name,
              result: 'success',
              message: i18n('Imported LND data from ${source}.', {
                source: label,
              }),
            })

            // Swaps this phase out for whatever the data needs next.
            await startupFlagsJson.merge(effects, { importPending: false })
            return null
          } catch (e) {
            // A oneshot's own health is internal to the chain — the SDK
            // publishes nothing for it — so every exit path has to leave this
            // check at a terminal result of its own, or a failed import shows
            // as an idle service.
            await sdk.setHealth(effects, {
              id: 'import',
              name,
              result: 'failure',
              message: utils.asError(e).message,
            })
            // Three straight failures is not a blip. The action is hidden and
            // its critical task was cleared when the migration was scheduled,
            // so without this there is no UI route back to correct the address
            // or password, or to fall back to Start Fresh — the exact dead end
            // this feature exists to avoid. Re-posting the critical task also
            // stops the service, which is what ends the retry loop; the
            // pending flag stays set so the wallet-exists guard knows any
            // copied data is an incomplete import.
            failures += 1
            if (failures >= 3 && !abort.aborted) {
              await sdk.action
                .createOwnTask(effects, initializeWallet, 'critical', {
                  reason: i18n(
                    'The wallet migration failed and needs attention',
                  ),
                })
                .catch((err) =>
                  console.error(
                    'failed to re-post the initialize-wallet task',
                    err,
                  ),
                )
            }
            throw e
          }
        },
      },
      requires: [],
    })
  }

  /**
   * Convert an imported bolt database to SQLite before LND opens it. Reports its
   * own phases through the `db-migration` health check and, on success, writes
   * the completion flag that swaps this phase out for LND (sqliteBackend.ts).
   */
  const conversionChain = () =>
    sdk.Daemons.of(effects).addOneshot('db-conversion', {
      subcontainer: null,
      exec: {
        // The conversion drives nested runUntilSuccess chains that take no
        // abort signal, and teardown awaits this fn — so without the race a
        // Stop would wait out the whole conversion. On abort the fn unblocks
        // and throws; the abandoned run keeps going only until main's context
        // leaves and reaps its chains. That interruption is the same one a
        // power cut inflicts, which the conversion is built to resume from.
        fn: async (_, abort) => {
          try {
            await Promise.race([
              migrateOnStart(effects),
              new Promise<never>((_resolve, reject) => {
                const stop = () =>
                  reject(new Error('Stopped during the database conversion'))
                if (abort.aborted) return stop()
                abort.addEventListener('abort', stop, { once: true })
              }),
            ])
          } catch (e) {
            if (!abort.aborted) {
              await sdk.setHealth(effects, {
                id: 'db-migration',
                name: i18n('Database Conversion'),
                result: 'failure',
                message: utils.asError(e).message,
              })
            }
            throw e
          }
          return null
        },
      },
      requires: [],
    })

  const lndChain = () =>
    sdk.Daemons.of(effects)
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
            // Auto-unlock off means a freshly started LND starts LOCKED, so
            // clear the "already unlocked" flag the manual-unlock action sets
            // — its metadata `.const` read picks this up and re-enables the
            // action for the next manual unlock.
            if (!autoUnlockEnabled) {
              await customConfigJson.merge(effects, { walletUnlocked: false })
            }
            // A password change requested by the Wallet - Password action must
            // run at the very top of this oneshot, while the wallet is still
            // LOCKED: LND's ChangePassword API is only served by the
            // WalletUnlocker, which disappears the moment the wallet is
            // unlocked. changepassword both changes the password AND unlocks,
            // so it fully replaces the unlock call — running it *after* this
            // oneshot unlocks (the old design's separate password-change
            // oneshot) always fails with "wallet already unlocked".
            //
            // The action staged current_password and autoUnlockEnabled:true
            // into the store before restarting main, so the change can be
            // applied even when auto-unlock was off (the password is
            // deliberately absent from the store in that state). On success
            // the new password is adopted and the wallet is already unlocked;
            // auto-unlock stays on so the new password remains available for
            // re-confirming Wallet - Password Backup, and the action's result
            // message tells the user they may disable it again afterwards.
            if (pendingPasswordChange) {
              console.log(
                'Pending password change detected. Performing change while wallet is LOCKED...',
              )
              const newPassword = Buffer.from(
                pendingPasswordChange,
                'base64',
              ).toString('utf8')
              const currentPassword = walletPassword || ''
              let attempts = 0
              while (attempts < 60) {
                if (abort.aborted) return null
                const state = await getLndState()
                if (state === 'LOCKED') break
                await sleep(1_000)
                attempts++
              }
              const currentBase64 = base64.stringify(
                Buffer.from(currentPassword, 'latin1'),
              )
              const newBase64 = base64.stringify(
                Buffer.from(newPassword, 'latin1'),
              )
              let res
              try {
                res = await subcontainer.exec([
                  'curl',
                  '--no-progress-meter',
                  '--fail-with-body',
                  '-X',
                  'POST',
                  '--cacert',
                  `${lndDataDir}/tls.cert`,
                  `${selfRestUrl}/v1/changepassword`,
                  '-d',
                  JSON.stringify({
                    current_password: currentBase64,
                    new_password: newBase64,
                  }),
                ])
              } catch (err) {
                // A transient exec failure (subcontainer torn down mid-
                // restart) must not strand the flag, or the Wallet - Password
                // action stays disabled forever. Clear it so the change can be
                // retried by the user.
                const body = utils.asError(err).message
                await storeJson.merge(
                  effects,
                  {
                    pendingPasswordChange: null,
                    passwordChangeError: body.substring(0, 300),
                  },
                  { allowWriteAfterConst: true },
                )
                throw new Error(
                  `Password change failed: ${body.substring(0, 300)}`,
                )
              }
              const stdout = res.stdout.toString().trim()
              // changepassword returns HTTP 200 with an error field in the
              // body on failure (old password wrong, etc.), and a non-zero
              // exit code when curl gets an actual HTTP error from `-f`.
              if (
                res.exitCode !== 0 ||
                stdout.includes('"error"') ||
                stdout.trim() === ''
              ) {
                const body = stdout || String(res.stderr).trim()
                // Surface the failure back to the action and clear the flag so
                // we do not retry a doomed change on every restart. This store
                // write restarts main; the staged auto-unlock state acts like
                // a regular unlock from here, so the node keeps working with
                // the current password.
                await storeJson.merge(
                  effects,
                  {
                    pendingPasswordChange: null,
                    passwordChangeError: body.substring(0, 300),
                  },
                  { allowWriteAfterConst: true },
                )
                throw new Error(
                  `Password change failed: ${body.substring(0, 300)}`,
                )
              }
              // Success: changepassword also unlocks. Adopt the new password
              // and clear the flag. ⚠️ main reads store with a `.const` watch,
              // so this write next restarts main — but only AFTER the wallet
              // is already unlocked with the new password, so LND restarts
              // straight into normal operation with it.
              console.log('Password changed successfully and wallet unlocked.')
              await storeJson.merge(
                effects,
                {
                  walletPassword: newPassword,
                  pendingPasswordChange: null,
                  passwordChangeError: null,
                  autoUnlockEnabled: true,
                  passwordBackupConfirmed: false,
                },
                { allowWriteAfterConst: true },
              )
              return null
            }

            // Auto-unlock disabled ⇒ the wallet must be unlocked manually via
            // the Wallet - Manual Unlock action. Never auto-unlock here.
            if (!autoUnlockEnabled && !walletPassword) {
              console.log(
                'wallet-unlock skipped, auto-unlock disabled and no password present',
              )
              return null
            }
            while (true) {
              if (abort.aborted) {
                console.log('wallet-unlock aborted')
                return null
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

              const pw = base64.stringify(Buffer.from(walletPassword, 'latin1'))

              // Regular unlock (no pending password change — that runs at the
              // top of this oneshot). changepassword is used for macaroon
              // rotation (/v1/changepassword with the same password), which
              // also unlocks, replacing the unlock call.
              const res = await subcontainer.exec([
                'curl',
                '--no-progress-meter',
                '-X',
                'POST',
                '--cacert',
                `${lndDataDir}/tls.cert`,
                rotateMacaroonRootKey
                  ? `${selfRestUrl}/v1/changepassword`
                  : `${selfRestUrl}/v1/unlockwallet`,
                '-d',
                rotateMacaroonRootKey
                  ? JSON.stringify({
                      current_password: pw,
                      new_password: pw,
                      new_macaroon_root_key: true,
                    })
                  : restore
                    ? JSON.stringify({
                        wallet_password: pw,
                        recovery_window: 2_500,
                      })
                    : JSON.stringify({ wallet_password: pw }),
              ])
              const stdout = res.stdout.toString().trim()
              // On the rotate path the body carries the new admin_macaroon —
              // never log it.
              console.log('wallet-unlock response', {
                exitCode: res.exitCode,
                stdout: rotateMacaroonRootKey ? '(redacted)' : stdout,
                stderr: String(res.stderr).trim(),
              })
              // `{}` = unlock succeeded. "wallet already unlocked" = wallet is
              // already past the LOCKED state (e.g. because /v1/state raced
              // with the oneshot). Both mean we're done. changepassword answers
              // with an admin_macaroon field instead of `{}`, and only when it
              // fails does the body carry an error.
              if (
                stdout === '{}' ||
                stdout.includes('wallet already unlocked') ||
                (rotateMacaroonRootKey && !stdout.includes('"error"'))
              ) {
                break
              }
              await sleep(10_000)
            }
            // Cleared here, not from a dependent oneshot: a restart lands in
            // the window between the two and arms the flag for every start after.
            await startupFlagsJson.merge(effects, {
              resetWalletTransactions: false,
              rotateMacaroonRootKey: false,
            })
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
            let res
            try {
              res = await lndSub.exec(
                ['lncli', `--rpcserver=${selfGrpcHost}`, 'getinfo'],
                {},
                30_000,
              )
            } catch {
              // The LND subcontainer can be momentarily absent while main is
              // re-running (e.g. Bitcoin's .cookie rotates on its restart,
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

              if (info.synced_to_graph) {
                graphSyncPendingSince = null
              } else if (graphSyncPendingSince === null) {
                graphSyncPendingSince = Date.now()
              }

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
                  message: graphSyncMessage(info, graphSyncPendingSince),
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
                      `--rpcserver=${selfGrpcHost}`,
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
                        `--rpcserver=${selfGrpcHost}`,
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
                      console.log(
                        `Error adding tower ${tower}: ${String(res.stderr)}`,
                      )
                    }
                  }
                  return null
                },
              },
              requires: ['lnd', 'unlock-wallet', 'sync-progress'],
            } as const)
          : null,
      )
      .addDaemon('channel-backup-watcher', {
        exec: {
          command: [
            'sh',
            '-c',
            [
              'SHOULD_EXIT=0',
              'cleanup() { SHOULD_EXIT=1; pkill -P $$ -f inotifywait 2>/dev/null; exit 0; }',
              'trap cleanup TERM INT',
              `backup_file="${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup"`,
              `config_file="${lndDataDir}/custom-config.json"`,
              '',
              '# Wait for config file to exist',
              'while [ ! -f "$config_file" ]; do',
              ' if [ "$SHOULD_EXIT" = "1" ]; then exit 0; fi',
              ' sleep 2',
              'done',
              '',
              'start_time=$(date +%s)',
              'while :; do',
              ' if [ "$SHOULD_EXIT" = "1" ]; then exit 0; fi',
              ' enabled=$(jq -r \'.channelAutoBackupEnabled // false\' "$config_file" 2>/dev/null || echo "false")',
              ' if [ "$enabled" != "true" ]; then',
              ' # Auto-backup disabled: wait for config change with short timeout',
              ' inotifywait -q -t 2 -e modify "$config_file" 2>/dev/null',
              ' continue',
              ' fi',
              ' if [ ! -s "$backup_file" ]; then',
              ' lncli --rpcserver=${selfGrpcHost} exportchanbackup --all --output_file "$backup_file" 2>/dev/null || sleep 5',
              ' continue',
              ' fi',
              ' # Wait for channel.backup change with short timeout',
              ' if ! inotifywait -q -t 2 -e modify,move,create,delete_self,move_self "$backup_file" 2>/dev/null; then',
              ' continue # timeout → loop and check SHOULD_EXIT',
              ' fi',
              '',
              ' current_time=$(date +%s)',
              ' elapsed=$((current_time - start_time))',
              ' grace_enabled=$(jq -r \'.backupStartupGracePeriod // false\' "$config_file" 2>/dev/null)',
              ' if [ "$grace_enabled" = "true" ] && [ "$elapsed" -lt 15 ]; then',
              ' echo "[$(date -Iseconds)] Startup backup suppression is enabled by user. Skipping initial channel.backup upload." >&2',
              ' continue',
              ' fi',
              '',
              ' echo "[$(date -Iseconds)] 🔄 Channel backup file changed. Triggering backup..." >&2',
              '',
              ' # Load config',
              ' rclone_b64=$(jq -r \'.rcloneConfig // empty\' "$config_file" 2>/dev/null)',
              ' [ -n "$rclone_b64" ] && echo "$rclone_b64" | base64 -d > /tmp/rclone.conf 2>/dev/null',
              ' remotes=$(jq -r \'.selectedRcloneRemotes // empty | .[]\' "$config_file" 2>/dev/null)',
              '',
              ' # Define normal and onion-specific timings',
              ' normal_overall_timeout=12',
              ' normal_contimeout=5s',
              ' normal_timeout=10s',
              ' onion_overall_timeout=60',
              ' onion_contimeout=30s',
              ' onion_timeout=50s',
              '',
              ' # Rclone',
              ' for remote in $remotes; do',
              ' echo "[$(date -Iseconds)] [RCLONE] Starting backup to $remote..." >&2',
              ' remote_name=$(echo "$remote" | cut -d: -f1)',
              '',
              ' # Check if this remote is SFTP and uses .onion',
              ' if [ "$remote_name" = "sftp" ]; then',
              '   sftp_host=$(jq -r --arg rname "$remote_name" \'.rcloneConfig // empty\' "$config_file" | base64 -d 2>/dev/null | grep -A 10 "\\[$remote_name\\]" | grep -i "host.*\\.onion" || echo "")',
              '   if [ -n "$sftp_host" ]; then',
              '     echo "[$(date -Iseconds)] [RCLONE] Detected SFTP .onion address, using Tor proxy (timeout=60s)..." >&2',
              '     overall_timeout=$onion_overall_timeout',
              '     contimeout=$onion_contimeout',
              '     timeout_opt=$onion_timeout',
              '     if RCLONE_CONFIG=/tmp/rclone.conf timeout ${overall_timeout}s rclone copy "$backup_file" "$remote" \\',
              '       --log-level=INFO \\',
              '       --contimeout=${contimeout} \\',
              '       --timeout=${timeout_opt} \\',
              '       --retries=1; then',
              '       echo "[$(date -Iseconds)] [RCLONE: $remote] ✅ Success" >&2',
              '     else',
              '       echo "[$(date -Iseconds)] [RCLONE: $remote] ❌ Failed" >&2',
              '     fi',
              '     continue',
              '   fi',
              ' fi',
              '',
              ' # Check if this remote is Nextcloud and uses .onion',
              ' if [ "$remote_name" = "nextcloud" ]; then',
              '   uses_onion=$(jq -r --arg rname "$remote_name" \'.rcloneConfig // empty\' "$config_file" | base64 -d 2>/dev/null | grep -A 10 "\\[$remote_name\\]" | grep -i "url.*\\.onion" || echo "")',
              '   if [ -n "$uses_onion" ]; then',
              '     echo "[$(date -Iseconds)] [RCLONE] Detected Nextcloud .onion address, using Tor proxy (timeout=60s)..." >&2',
              '     overall_timeout=$onion_overall_timeout',
              '     contimeout=$onion_contimeout',
              '     timeout_opt=$onion_timeout',
              '     if HTTP_PROXY=socks5://10.0.3.1:9050 HTTPS_PROXY=socks5://10.0.3.1:9050 ALL_PROXY=socks5://10.0.3.1:9050 RCLONE_CONFIG=/tmp/rclone.conf timeout ${overall_timeout}s rclone copy "$backup_file" "$remote" \\',
              '       --log-level=INFO \\',
              '       --contimeout=${contimeout} \\',
              '       --timeout=${timeout_opt} \\',
              '       --retries=1 \\',
              '       --no-check-certificate; then',
              '       echo "[$(date -Iseconds)] [RCLONE: $remote] ✅ Success" >&2',
              '     else',
              '       echo "[$(date -Iseconds)] [RCLONE: $remote] ❌ Failed" >&2',
              '     fi',
              '     continue',
              '   fi',
              ' fi',
              '',
              ' # Normal clearnet remote (Dropbox, GDrive, non-onion SFTP/Nextcloud, etc.)',
              ' overall_timeout=$normal_overall_timeout',
              ' contimeout=$normal_contimeout',
              ' timeout_opt=$normal_timeout',
              ' if RCLONE_CONFIG=/tmp/rclone.conf timeout ${overall_timeout}s rclone copy "$backup_file" "$remote" \\',
              '   --log-level=INFO \\',
              '   --contimeout=${contimeout} \\',
              '   --timeout=${timeout_opt} \\',
              '   --retries=1; then',
              '   echo "[$(date -Iseconds)] [RCLONE: $remote] ✅ Success" >&2',
              ' else',
              '   echo "[$(date -Iseconds)] [RCLONE: $remote] ❌ Failed" >&2',
              ' fi',
              ' done',
              '',
              ' # Email',
              ' email_enabled=$(jq -r \'.emailEnabled // false\' "$config_file" 2>/dev/null)',
              ' if [ "$email_enabled" = "true" ]; then',
              ' email_to=$(jq -r \'.emailBackup.to // empty\' "$config_file" 2>/dev/null)',
              ' if [ -z "$email_to" ] || [ "$email_to" = "empty" ]; then',
              ' echo "[$(date -Iseconds)] [EMAIL] ⚠️ Skipped: email_to not configured" >&2',
              ' else',
              ' email_from=$(jq -r \'.emailBackup.from // empty\' "$config_file" 2>/dev/null)',
              ' email_smtp_server=$(jq -r \'.emailBackup.smtp_server // "smtp.gmail.com"\' "$config_file" 2>/dev/null)',
              ' email_smtp_port=$(jq -r \'.emailBackup.smtp_port // 465\' "$config_file" 2>/dev/null)',
              ' email_smtp_user=$(jq -r \'.emailBackup.smtp_user // empty\' "$config_file" 2>/dev/null)',
              ' email_smtp_pass=$(jq -r \'.emailBackup.smtp_pass // empty\' "$config_file" 2>/dev/null)',
              ' if [ -z "$email_smtp_pass" ] || [ "$email_smtp_pass" = "empty" ]; then',
              ' echo "[$(date -Iseconds)] [EMAIL] ❌ Skipped: missing password" >&2',
              ' else',
              ' echo "[$(date -Iseconds)] [EMAIL] Starting backup to $email_to..." >&2',
              ' protocol="smtps"; starttls="no"',
              ' [ "$email_smtp_port" = "587" ] && { protocol="smtp"; starttls="yes"; }',
              ' cat > /tmp/muttrc <<EOF',
              'set from = "$email_from"',
              'set realname = "LND Backup"',
              'set smtp_url = "$protocol://$email_smtp_user@$email_smtp_server:$email_smtp_port/"',
              'set smtp_pass = "$email_smtp_pass"',
              'set ssl_starttls = $starttls',
              'set ssl_force_tls = yes',
              'EOF',
              ' attempt=1',
              ' max_attempts=5',
              ' while [ $attempt -le $max_attempts ]; do',
              ' if nslookup "$email_smtp_server" >/dev/null 2>&1; then',
              ' break',
              ' fi',
              ' echo "[$(date -Iseconds)] [EMAIL] DNS lookup failed for \'$email_smtp_server\' (attempt $attempt/$max_attempts). Retrying in 2s..." >&2',
              ' sleep 2',
              ' attempt=$((attempt + 1))',
              ' done',
              ' if [ $attempt -gt $max_attempts ]; then',
              ' echo "[$(date -Iseconds)] [EMAIL] ❌ Failed: Could not resolve host \'$email_smtp_server\' after $max_attempts retries" >&2',
              ' else',
              " recipients=$(echo \"$email_to\" | tr -d ' ' | tr ',' ' ')",
              ' body_template=$(jq -r \'.emailBackup.body // empty\' "$config_file" 2>/dev/null)',
              ' if [ -z "$body_template" ]; then',
              '   body_template="Your LND channel.backup file is attached.\\n\\nThis file is encrypted with your Aezeed seed and safe to store anywhere."',
              ' fi',
              ' if printf "%b" "$body_template" | mutt -F /tmp/muttrc -s "LND Channel Backup $(date -Iseconds)" -a "$backup_file" -- $recipients; then',
              ' echo "[$(date -Iseconds)] [EMAIL] ✅ Success" >&2',
              ' else',
              ' echo "[$(date -Iseconds)] [EMAIL] ❌ Failed" >&2',
              ' fi',
              ' fi',
              ' fi',
              ' fi',
              ' fi',
              'done',
            ].join('\n'),
          ],
        },
        subcontainer: lndSub,
        ready: {
          display: null,
          fn: async () => {
            const config = await customConfigJson
              .read()
              .once()
              .catch(() => null)
            return config?.channelAutoBackupEnabled
              ? { result: 'success', message: '✅ Active' }
              : { result: 'disabled', message: '❌ Disabled' }
          },
        },
        requires: ['lnd', 'unlock-wallet'],
      })

      .addHealthCheck('wallet-status', {
        ready: {
          display: 'Wallet Status',
          fn: async () => {
            const store = await storeJson.read().once()
            const walletInitialized = store?.walletInitialized ?? false
            const autoUnlock = store?.autoUnlockEnabled ?? false
            if (!walletInitialized) {
              return {
                message: 'Wallet not initialized',
                result: 'loading',
              }
            }
            const state = await getLndState()
            if (
              state === 'UNLOCKED' ||
              state === 'RPC_ACTIVE' ||
              state === 'SERVER_ACTIVE'
            ) {
              walletLockedSince = null
              return {
                message: 'Wallet is unlocked',
                result: 'success',
              }
            }
            // `lncli getinfo` cannot tell a locked wallet from a genuine
            // startup: the RPC server reports "in the process of starting up"
            // until the wallet is unlocked, on every LND version. /v1/state is
            // the only endpoint that says LOCKED outright — so read it instead.
            if (state === 'LOCKED') {
              if (walletLockedSince === null) walletLockedSince = Date.now()
              if (Date.now() - walletLockedSince < WALLET_LOCKED_GRACE_MS) {
                return {
                  message: i18n('LND is starting…'),
                  result: 'starting',
                }
              }
              return autoUnlock
                ? {
                    message: `Wallet is locked, but auto-unlock is enabled. 🔑 Password is not correct! Go to "Actions ⇢ Security ⇢ Wallet - Auto-Unlock" and enter correct password.`,
                    result: 'loading',
                  }
                : {
                    message:
                      'Wallet is locked as auto-unlock is disabled. Go to ⇓ Tasks or "Actions ⇢ Security ⇢ Wallet - Manual Unlock" and enter correct password.',
                    result: 'loading',
                  }
            }
            return {
              message: i18n('LND is starting…'),
              result: 'starting',
            }
          },
        },
        requires: ['lnd'],
      })
      .addHealthCheck('security-status', {
        ready: {
          display: 'Security Status',
          fn: async () => {
            const store = await storeJson.read().once()
            // Read defensively: a stale/fork volume may have saved a literal
            // control byte that makes JSON.parse throw before zod's `.catch()`
            // can apply defaults. Guard it so a transient corrupt file shows a
            // disabled banner instead of crash-looping the health check.
            const config = await customConfigJson
              .read()
              .once()
              .catch(() => null)
            const backupEnabled = config?.channelAutoBackupEnabled ?? false
            const backupIcon = backupEnabled ? '\u{1F7E2}' : '\u{1F534}'
            const backupText = backupEnabled ? 'ENABLED' : 'DISABLED'
            const autoUnlock = store?.autoUnlockEnabled ?? false
            const unlockIcon = autoUnlock ? '\u{1F7E1}' : '\u{1F7E2}'
            const unlockText = autoUnlock ? 'AUTO' : 'MANUAL'
            const seedOnServer = (store?.aezeedCipherSeed || []).length > 0
            const seedIcon = seedOnServer ? '\u{1F7E1}' : '\u{1F7E2}'
            const seedText = seedOnServer ? 'ON\u00A0SERVER' : 'DELETED'
            const wtClientEnabled = (store?.watchtowerClients || []).length > 0
            const wtIcon = wtClientEnabled ? '\u{1F7E2}' : '\u{1F534}'
            const wtText = wtClientEnabled ? 'ENABLED' : 'DISABLED'
            const allGood =
              backupEnabled && !autoUnlock && !seedOnServer && wtClientEnabled
            const result = allGood ? 'success' : 'disabled'
            const block1 = `\u3010${backupIcon}\u00A0${backupText} Channels Backup\u3011`
            const block2 = `\u3010${unlockIcon}\u00A0${unlockText} Wallet Unlock\u3011`
            const block3 = `\u3010${seedIcon}\u00A0${seedText} Aezeed Seed\u3011`
            const block4 = `\u3010${wtIcon}\u00A0${wtText} Watchtower Client\u3011`
            const message = `${block1}${block2}${block3}${block4}`
            return { message, result }
          },
        },
        requires: ['lnd'],
      })

  return sdk.Daemons.dynamic(effects, async ({ effects: dynEffects }) => {
    const importPending = await startupFlagsJson
      .read((f) => f.importPending)
      .const(dynEffects)
    // Arms the second swap trigger: the conversion phase writes this flag when
    // it finishes. Its other inputs are on-disk files that needsSqliteMigration
    // stats for itself, and dbSchemaFinalized is deliberately not watched — it
    // flips mid-conversion, and swapping chains then would abandon the run.
    await startupFlagsJson.read((f) => f.dbMigrationComplete).const(dynEffects)

    // Order is load-bearing: LND must never open an un-imported or un-converted
    // data directory, so each preparatory phase holds the chain until the flag
    // or the on-disk state that selected it is gone.
    if (importPending) return importChain(importPending.source)
    if (await needsSqliteMigration()) return conversionChain()
    return lndChain()
  })
})
