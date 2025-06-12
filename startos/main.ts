import { sdk } from './sdk'
import { Daemons, FileHelper, T } from '@start9labs/start-sdk'
import {
  GetInfo,
  lndConfDefaults,
  lndDataDir,
  mainMounts,
  sleep,
} from './utils'
import { restPort, peerInterfaceId } from './interfaces'
import { readFile, access } from 'fs/promises'
import { lndConfFile } from './fileModels/lnd.conf'
import { manifest } from './manifest'
import { storeJson } from './fileModels/store.json'
import { Effects, SIGTERM } from '@start9labs/start-sdk/base/lib/types'

export const main = sdk.setupMain(async ({ effects, started }) => {
  /**
   * ======================== Setup (optional) ========================
   */
  console.log('Starting LND!')

  const depResult = await sdk.checkDependencies(effects)
  depResult.throwIfNotSatisfied()

  const {
    recoveryWindow,
    resetWalletTransactions,
    restore,
    walletInitialized,
    walletPassword,
    watchtowers,
  } = (await storeJson.read().once())!

  if (!walletInitialized) {
    console.log('Fresh install detected. Initializing LND wallet')
    await initializeLnd(effects)
    await storeJson.merge(effects, { walletInitialized: true })
  }

  const osIp = await sdk.getOsIp(effects)
  const conf = (await lndConfFile.read().once())!

  const peerAddresses = (
    await sdk.serviceInterface.getOwn(effects, peerInterfaceId).const()
  )?.addressInfo?.publicUrls

  if (
    [conf.externalhosts].flat() !== peerAddresses ||
    ![conf.rpclisten].flat()?.includes(lndConfDefaults.rpclisten) ||
    ![conf.restlisten].flat()?.includes(lndConfDefaults.restlisten) ||
    conf['tor.socks'] !== `${osIp}:9050`
  ) {
    await lndConfFile.merge(effects, {
      externalhosts: peerAddresses,
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
    })
  }

  // restart on lnd.conf changes
  await lndConfFile.read().const(effects)

  const lndArgs: string[] = []

  if (resetWalletTransactions) lndArgs.push('--reset-wallet-transactions')

  const lndSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mainMounts.mountDependency({
      dependencyId: 'bitcoind',
      mountpoint: '/mnt/bitcoin',
      readonly: true,
      subpath: null,
      volumeId: 'main',
    }),
    'lnd-sub',
  )

  // Restart if Bitcoin .cookie changes
  await FileHelper.string(`${lndSub.rootfs}/mnt/bitcoin/.cookie`)
    .read()
    .const(effects)

  /**
   * ======================== Daemons ========================
   */
  const baseDaemons = sdk.Daemons.of(effects, started)
    .addDaemon('primary', {
      exec: { command: ['lnd', ...lndArgs] },
      subcontainer: lndSub,
      ready: {
        display: 'Control Interface',
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, restPort, {
            successMessage:
              'The Control Interface is ready to accept gRPC and REST connections',
            errorMessage: 'The Control Interface is not ready',
          }),
      },
      requires: [],
    })
    .addHealthCheck('sync-progress', {
      requires: ['primary'],
      ready: {
        display: 'Network and Graph Sync Progress',
        fn: async () => {
          let macHex: string = ''
          do {
            try {
              const res = await readFile(
                `${lndSub.rootfs}/${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`,
              )
              macHex = res.toString('hex')
              break
            } catch (err) {
              console.log('Waiting for Admin Macaroon to be created...')
              await sleep(10_000)
            }
          } while (true)
          const res = await lndSub.exec([
            'curl',
            '--no-progress-meter',
            '--header',
            `Grpc-Metadata-macaroon: ${macHex}`,
            '--cacert',
            `${lndDataDir}/tls.cert`,
            'https://lnd.startos:8080/v1/getinfo',
          ])

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
          } else {
            return {
              message: res.stderr as string,
              result: 'failure',
            }
          }
        },
      },
    })
    .addOneshot('unlock-wallet', {
      exec: {
        command: [
          'curl',
          '--no-progress-meter',
          'POST',
          '--cacert',
          `${lndDataDir}/tls.cert`,
          'https://lnd.startos:8080/v1/unlockwallet',
          '-d',
          restore
            ? JSON.stringify({
                wallet_password: walletPassword,
                recovery_window: recoveryWindow,
              })
            : JSON.stringify({
                wallet_password: walletPassword,
              }),
        ],
      },
      subcontainer: lndSub,
      requires: ['primary'],
    })

  let daemons: Daemons<
    typeof manifest,
    'primary' | 'unlock-wallet' | 'restore' | 'sync-progress'
  > = baseDaemons
  if (restore) {
    daemons = baseDaemons.addOneshot('restore', {
      subcontainer: lndSub,
      exec: {
        fn: async (subcontainer) => {
          try {
            access(
              `${subcontainer.rootfs}/${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup`,
            )
          } catch (e) {
            console.log('No channel.backup found. Skipping SCB Recovery.')
            await storeJson.merge(effects, { restore: false })
            return null
          }
          // Restart on storeJson changes
          await storeJson.read().const(effects)
          return {
            command: [
              'lncli',
              '--rpcserver=lnd.startos',
              'restorechanbackup',
              '--multi_file',
              `${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup,`,
            ],
          }
        },
      },
      requires: ['primary', 'unlock-wallet'],
    })
  } else {
    // Restart on storeJson changes
    await storeJson.read().const(effects)
  }

  if (watchtowers.length > 0) {
    return daemons.addOneshot('add-watchtowers', {
      exec: {
        fn: async (subcontainer, abort) => {
          // Setup watchtowers at runtime because for some reason they can't be setup in lnd.conf
          for (const tower of watchtowers || []) {
            if (abort.signal.aborted) break
            console.log(`Watchtower client adding ${tower}`)
            let res = await subcontainer.exec(
              ['lncli', '--rpcserver=lnd.startos', 'wtclient', 'add', tower],
              undefined,
              undefined,
              abort,
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
      requires: ['primary', 'unlock-wallet'],
      subcontainer: lndSub,
    })
  }

  return daemons
})

async function initializeLnd(effects: Effects) {
  await sdk.SubContainer.withTemp(
    effects,
    {
      imageId: 'lnd',
    },
    mainMounts.mountDependency({
      dependencyId: 'bitcoind',
      mountpoint: '/mnt/bitcoin',
      readonly: true,
      subpath: null,
      volumeId: 'main',
    }),
    'initialize-lnd',
    async (subc) => {
      const child = await subc.spawn(['lnd'])

      let cipherSeed: string[] = []
      let i = 0
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
          i++
          await sleep(5_000)
        }
      } while (i <= 10)

      const walletPassword = (await storeJson.read().once())?.walletPassword

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
          wallet_password: walletPassword,
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
