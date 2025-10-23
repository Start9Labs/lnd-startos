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
import { base64 } from 'rfc4648'
export const main = sdk.setupMain(async ({ effects, started }) => {
  console.log('Starting LND!')

  let {
    recoveryWindow,
    resetWalletTransactions,
    restore,
    walletInitialized,
    walletPassword,
    watchtowers,
    pendingPasswordChange,
    passwordChangeError,
    autoUnlockEnabled,
    seedBackupConfirmed,
    passwordBackupConfirmed,
  } = (await storeJson.read().once())!

  // ✅ EARLY TASK MANAGEMENT: Create or clear manual unlock task
  if (autoUnlockEnabled) {
    console.log('Auto-unlock is enabled. Clearing manual-wallet-unlock task...')
    try {
      await sdk.action.clearTask(effects, 'lnd', 'manual-wallet-unlock')
      console.log('✅ Manual unlock task cleared successfully.')
    } catch (err) {
      console.log('ℹ️ No manual-wallet-unlock task to clear (or already gone).')
    }
  } else if (walletInitialized) {
    console.log('Auto-unlock disabled and wallet initialized. Creating manual unlock task...')
    try {
      const { manualWalletUnlock } = await import('./actions/walletPassword')
      await sdk.action.createOwnTask(effects, manualWalletUnlock, 'optional', {
        reason: 'LND wallet is locked and auto-unlock is disabled. Use the "Unlock Wallet" action to provide your password. If you have enabled auto-unlock, you can safely dismiss this task.',
      })
      console.log('✅ Manual unlock task created.')
    } catch (err) {
      console.warn('⚠️ Failed to create manual unlock task:', (err as Error).message)
    }
  }

  console.log('Initial walletPassword from store.json (base64):************************')//, walletPassword)
  console.log('Auto-unlock enabled:', autoUnlockEnabled)
  console.log('Seed backup confirmed:', seedBackupConfirmed)
  console.log('Password backup confirmed:', passwordBackupConfirmed)

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
    const updatedStore = (await storeJson.read().once())!
    walletPassword = updatedStore.walletPassword
    recoveryWindow = updatedStore.recoveryWindow
    resetWalletTransactions = updatedStore.resetWalletTransactions
    restore = updatedStore.restore
    walletInitialized = updatedStore.walletInitialized
    watchtowers = updatedStore.watchtowers
    pendingPasswordChange = updatedStore.pendingPasswordChange
    passwordChangeError = updatedStore.passwordChangeError
    autoUnlockEnabled = updatedStore.autoUnlockEnabled
    seedBackupConfirmed = updatedStore.seedBackupConfirmed
    passwordBackupConfirmed = updatedStore.passwordBackupConfirmed
    console.log('Refreshed walletPassword after initialization (base64):************************')//, walletPassword)
    console.log('Auto-unlock enabled after initialization:', autoUnlockEnabled)
  }

  if (pendingPasswordChange) {
    if (!walletPassword) {
      throw new Error('Cannot change password: no current password available')
    }
    console.log('Pending password change detected. Performing change...')
    const newPassword = Buffer.from(pendingPasswordChange, 'base64').toString('utf8')
    const currentPassword = Buffer.from(walletPassword, 'base64').toString('utf8')
    console.log('Current password (decoded):************************')//, currentPassword)
    console.log('New password (decoded):************************')//, newPassword)

    try {
      await sdk.SubContainer.withTemp(
        effects,
        { imageId: 'lnd' },
        mounts,
        'change-password-temp',
        async (lndSub) => {
          const lndArgs: string[] = []
          if (resetWalletTransactions) lndArgs.push('--reset-wallet-transactions')
          lndArgs.push('--nobootstrap')
          lndArgs.push('--debuglevel=info')
          lndArgs.push('--rpclisten=0.0.0.0:10009')
          lndArgs.push('--restlisten=0.0.0.0:8080')

          console.log('Spawning LND with args:', lndArgs)
          await lndSub.spawn(['lnd', ...lndArgs])

          await new Promise(r => setTimeout(r, 2000))
          let attempts = 0
          const maxAttempts = 60
          let restReady = false
          while (attempts < maxAttempts) {
            try {
              const portTest = await lndSub.exec([
                'curl',
                '--no-progress-meter',
                '--insecure',
                '--cacert',
                `${lndDataDir}/tls.cert`,
                'https://localhost:8080/v1/genseed',
              ])
              if (portTest.exitCode === 0) {
                restReady = true
                break
              }
            } catch (e: unknown) {
              const errorMessage = e instanceof Error ? e.message : String(e)
              console.log('REST API check failed:', errorMessage)
            }
            await new Promise(r => setTimeout(r, 1000))
            attempts++
          }
          if (!restReady) {
            throw new Error('LND REST port not ready after 60s.')
          }

          const currentBase64 = Buffer.from(currentPassword, 'utf8').toString('base64')
          const newBase64 = Buffer.from(newPassword, 'utf8').toString('base64')
          const jsonBody = JSON.stringify({
            current_password: currentBase64,
            new_password: newBase64,
            stateless_init: false,
            new_macaroon_root_key: false,
          }).replace(/"/g, '\\"')
          const curlCmd = `curl -v -X POST --insecure --cacert ${lndDataDir}/tls.cert https://localhost:8080/v1/changepassword -H "Content-Type: application/json" -d "${jsonBody}"`
          const changeResult = await lndSub.exec(['sh', '-c', curlCmd])

          if (changeResult.exitCode !== 0) {
            const errStr = (changeResult.stderr?.toString() || changeResult.stdout?.toString() || '').toLowerCase()
            throw new Error(`Password change failed: ${errStr.substring(0, 300)}...`)
          }

          const response = changeResult.stdout?.toString().trim()
          let apiError = null
          if (response && response !== '{}') {
            try {
              const parsed = JSON.parse(response)
              if (parsed.error || parsed.message) {
                apiError = parsed.message || parsed.error || response
              }
            } catch (e) {
              apiError = response
            }
          }
          if (apiError) {
            throw new Error(`API error: ${apiError.substring(0, 200)}...`)
          }

          await lndSub.exec(['pkill', '-9', 'lnd'])
        },
      )

      console.log('Updating store with new password')
      await storeJson.merge(effects, {
        walletPassword: pendingPasswordChange,
        pendingPasswordChange: null,
        passwordChangeError: null,
        autoUnlockEnabled: true,
      })
      console.log('Password changed successfully.')

      // Clear task after password change (since auto-unlock is re-enabled)
      try {
        await sdk.action.clearTask(effects, 'lnd', 'manual-wallet-unlock')
        console.log('✅ Manual unlock task cleared after password change.')
      } catch (clearTaskErr) {
        console.warn('ℹ️ Could not clear manual unlock task (likely already gone).')
      }

      const updatedStore = (await storeJson.read().once())!
      walletPassword = updatedStore.walletPassword
      recoveryWindow = updatedStore.recoveryWindow
      resetWalletTransactions = updatedStore.resetWalletTransactions
      restore = updatedStore.restore
      walletInitialized = updatedStore.walletInitialized
      watchtowers = updatedStore.watchtowers
      pendingPasswordChange = updatedStore.pendingPasswordChange
      passwordChangeError = updatedStore.passwordChangeError
      autoUnlockEnabled = updatedStore.autoUnlockEnabled
      seedBackupConfirmed = updatedStore.seedBackupConfirmed
      passwordBackupConfirmed = updatedStore.passwordBackupConfirmed
      console.log('Refreshed walletPassword after password change (base64):************************')//, walletPassword)
      console.log('Auto-unlock enabled after password change:', autoUnlockEnabled)
    } catch (err) {
      console.error('Password change failed:', err)
      await storeJson.merge(effects, {
        pendingPasswordChange: null,
        passwordChangeError: (err as Error).message || String(err),
      })
      throw err
    }
  }

  await storeJson.read().const(effects)

  const osIp = await sdk.getOsIp(effects)

  if (
    ![conf.rpclisten].flat()?.includes(lndConfDefaults.rpclisten[0]) ||
    ![conf.restlisten].flat()?.includes(lndConfDefaults.restlisten[0]) ||
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

  if (conf['bitcoin.node'] === 'bitcoind') {
    await FileHelper.string(`${lndSub.rootfs}/mnt/bitcoin/.cookie`)
      .read()
      .const(effects)
  }

  return sdk.Daemons.of(effects, () => started(() => Promise.resolve()))
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
          const currentStore = (await storeJson.read().const(effects))!
          const currentAutoUnlockEnabled = currentStore.autoUnlockEnabled
          const currentWalletPassword = currentStore.walletPassword
          const currentWalletInitialized = currentStore.walletInitialized
          const recoveryWindow = currentStore.recoveryWindow
          const restore = currentStore.restore

          console.log(`Unlock oneshot started... Auto-unlock: ${currentAutoUnlockEnabled}`)

          if (!currentWalletInitialized) {
            console.log('Wallet not initialized. Skipping unlock.')
            return null
          }

          if (currentAutoUnlockEnabled && currentWalletPassword) {
            console.log('Auto-unlock enabled. Unlocking wallet...')
            try {
              const command = [
                'curl',
                '--no-progress-meter',
                '-X', 'POST',
                '--insecure',
                '--cacert', `${lndDataDir}/tls.cert`,
                'https://lnd.startos:8080/v1/unlockwallet',
                '-d',
                restore
                  ? JSON.stringify({ wallet_password: currentWalletPassword, recovery_window: recoveryWindow })
                  : JSON.stringify({ wallet_password: currentWalletPassword }),
              ]
              const result = await subcontainer.exec(command, undefined, undefined, { abort: abort.reason, signal: abort })
              console.log('Wallet unlocked successfully.')
              return null
            } catch (err) {
              console.error('Failed to unlock wallet:', err)
              throw err
            }
          } else {
            console.log('Auto-unlock disabled or no password. Skipping auto-unlock.')
            return null
          }
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
                message: 'Synced to graph but not to chain',
                result: 'loading',
              }
            } else if (info.synced_to_chain && !info.synced_to_graph) {
              return {
                message: 'Synced to chain but not to graph',
                result: 'loading',
              }
            } else {
              return {
                message: 'Not synced to chain or graph',
                result: 'loading',
              }
            }
          } else if (
            res.exitCode === 2 &&
            typeof res.stderr === 'string' &&
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
    .addHealthCheck('wallet-status', {
      requires: ['primary'],
      ready: {
        display: 'Wallet Status',
        fn: async () => {
          const store = await storeJson.read().const(effects);
          const autoUnlockEnabled = store?.autoUnlockEnabled ?? false;
          const walletInitialized = store?.walletInitialized ?? false;

          if (!walletInitialized) {
            return {
              message: 'Wallet not initialized',
              result: 'loading',
            };
          }

          const res = await lndSub.exec(['lncli', '--rpcserver=lnd.startos', 'getinfo'], {}, 30_000);

          if (res.exitCode === 0) {
            return {
              message: 'Wallet is unlocked',
              result: 'success',
            };
          } else if (
            res.stderr &&
            typeof res.stderr === 'string' &&
            (res.stderr.includes('wallet locked, unlock it to enable full RPC access') ||
             res.stderr.includes('wallet is encrypted'))
          ) {
            if (autoUnlockEnabled) {
              return {
                message: `Wallet is locked, but auto-unlock is enabled. \u{1F511} Password is not correct! Go to "Actions ⇢ Security ⇢ Auto-Unlock Wallet" and enter correct password.`,
                result: 'failure',
              };
            } else {
              return {
                message: 'Wallet is locked as auto-unlock is disabled. Go to \u{21D3} Tasks or "Actions ⇢ Security ⇢ Unlock Wallet Manually" and enter correct password.',
                result: 'failure',
              };
            }
          } else {
            return {
              message: `Unknown error: ${res.stderr as string}`,
              result: 'failure',
            };
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
                for (const tower of watchtowers || []) {
                  if (abort.aborted) return null
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
  effects: any,
  mounts: typeof mainMounts,
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
          '--insecure',
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

      const store = (await storeJson.read().once())!
      const walletPassword = store.walletPassword!
      const plaintextPassword = Buffer.from(walletPassword, 'base64').toString('utf8')
      const existingSeedBackupConfirmed = store.seedBackupConfirmed ?? false
      const existingPasswordBackupConfirmed = store.passwordBackupConfirmed ?? false
      console.log('Using existing plaintext password:**********************')//, plaintextPassword)
      console.log('Initializing wallet with walletPassword (base64):************************')//, walletPassword)

      await storeJson.merge(effects, {
      aezeedCipherSeed: cipherSeed,
      walletInitialized: true,
      autoUnlockEnabled: true,
      seedBackupConfirmed: existingSeedBackupConfirmed,      // preserve
      passwordBackupConfirmed: existingPasswordBackupConfirmed, // preserve
      })

      const status = await subc.exec([
        'curl',
        '--no-progress-meter',
        '-X',
        'POST',
        '--insecure',
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

      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 60_000)
      })
    },
  )
}