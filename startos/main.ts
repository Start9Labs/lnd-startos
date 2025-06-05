import { sdk } from './sdk'
import { Daemons, FileHelper, T } from '@start9labs/start-sdk'
import { GetInfo, lndDataDir, mainMounts, sleep } from './utils'
import { restPort, peerInterfaceId } from './interfaces'
import { readFile, access } from 'fs/promises'
import { lndConfFile } from './fileModels/lnd.conf'
import { manifest } from './manifest'
import { storeJson } from './fileModels/store.json'
import { Effects, SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import * as fs from 'node:fs/promises'
import { Daemon } from '@start9labs/start-sdk/package/lib/mainFn/Daemon'

export const main = sdk.setupMain(async ({ effects, started }) => {
  /**
   * ======================== Setup (optional) ========================
   *
   * In this section, we fetch any resources or run any desired preliminary commands.
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
  const containerIp = await sdk.getContainerIp(effects).once()
  const conf = (await lndConfFile.read().once())!

  const peerAddresses = (
    await sdk.serviceInterface.getOwn(effects, peerInterfaceId).const()
  )?.addressInfo?.publicUrls

  if (
    [conf.externalhosts].flat() !== peerAddresses ||
    ![conf.rpclisten].flat()?.includes(`0.0.0.0:10009`) ||
    ![conf.restlisten].flat()?.includes(`0.0.0.0:8080`) ||
    conf['tor.socks'] !== `${osIp}:9050`
  ) {
    await lndConfFile.merge(effects, {
      externalhosts: peerAddresses,
      'tor.socks': `${osIp}:9050`,
      rpclisten: conf.rpclisten
        ? [...new Set([[conf.rpclisten].flat(), `0.0.0.0:10009`].flat())]
        : `0.0.0.0:10009`,
      restlisten: conf.restlisten
        ? [...new Set([[conf.restlisten].flat(), `0.0.0.0:8080`].flat())]
        : `0.0.0.0:8080`,
    })
  }

  // restart on lnd.conf changes
  await lndConfFile.read().const(effects)

  const lndArgs: string[] = []

  if (resetWalletTransactions) lndArgs.push('--reset-wallet-transactions')

  /**
   * ======================== Additional Health Checks (optional) ========================
   *
   * In this section, we define *additional* health checks beyond those included with each daemon (below).
   */
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

  const syncCheck = sdk.HealthCheck.of(effects, {
    id: 'sync-progress',
    name: 'Blockchain and Graph Sync Progress',
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
        res.stderr.includes('rpc error: code = Unknown desc = waiting to start')
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
  })

  const additionalChecks: T.HealthCheck[] = [syncCheck]

  /**
   * ======================== Daemons ========================
   *
   * In this section, we create one or more daemons that define the service runtime.
   *
   * Each daemon defines its own health check, which can optionally be exposed to the user.
   */

  const baseDaemons = sdk.Daemons.of(effects, started, additionalChecks)
    .addDaemon('primary', {
      command: ['lnd', ...lndArgs],
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
    .addOneshot('unlock-wallet', {
      command: [
        'curl',
        '--no-progress-meter',
        'POST',
        '--cacert',
        `${lndDataDir}/tls.cert`,
        'https://lnd.startos:8080/v1/unlockwallet',
        '-d',
        JSON.stringify({
          wallet_password: walletPassword,
          recovery_window: recoveryWindow,
        }),
      ],
      subcontainer: lndSub,
      requires: ['primary'],
    })

  let daemons: Daemons<
    typeof manifest,
    'primary' | 'unlock-wallet' | 'restore'
  > = baseDaemons
  if (restore) {
    daemons = baseDaemons.addOneshot('restore', {
      subcontainer: lndSub,
      command: async (subcontainer) => {
        try {
          access(
            `${subcontainer.rootfs}/${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup`,
          )
        } catch (e) {
          console.log('No channel.backup found. Skipping SCB Recovery.')
          await storeJson.merge(effects, { restore: false })
          return ['true']
        }
        // Restart on storeJson changes
        await storeJson.read().const(effects)
        return [
          'lncli',
          '--rpcserver=lnd.startos',
          'restorechanbackup',
          '--multi_file',
          '/root/.lnd/data/chain/bitcoin/mainnet/channel.backup',
        ]
      },
      requires: ['primary', 'unlock-wallet'],
    })
  } else {
    // Restart on storeJson changes
    await storeJson.read().const(effects)
    return daemons
  }

  return daemons.addOneshot('add-watchtowers', {
    command: async (subcontainer) => {
      // Setup watchtowers at runtime because for some reason they can't be setup in lnd.conf
      for (const tower of watchtowers || []) {
        console.log(`Watchtower client adding ${tower}`)
        let res = await subcontainer.exec([
          'lncli',
          '--rpcserver=lnd.startos',
          'wtclient',
          'add',
          tower,
        ])

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
      return ['true']
    },
    requires: ['primary', 'unlock-wallet'],
    subcontainer: lndSub,
  })
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
      await lndConfFile.merge(effects, {
        rpclisten: `0.0.0.0:10009`,
        restlisten: `0.0.0.0:8080`,
      })

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
      await new Promise<void>((resolve, reject) => {
        child.on('exit', () => resolve())
        setTimeout(resolve, 60_000)
      })
    },
  )
}
