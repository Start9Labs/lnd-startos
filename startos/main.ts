import { sdk } from './sdk'
import { FileHelper, T } from '@start9labs/start-sdk'
import { GetInfo, lndConfDefaults, mainMounts, sleep } from './utils'
import { controlPort } from './interfaces'
import { readFile } from 'fs/promises'
import { lndConfFile } from './file-models/lnd.conf'
import { storeJson } from './file-models/store.json'
import { Effects, SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import * as fs from 'node:fs/promises'

export const main = sdk.setupMain(async ({ effects, started }) => {
  /**
   * ======================== Setup (optional) ========================
   *
   * In this section, we fetch any resources or run any desired preliminary commands.
   */
  console.log('Starting LND!')

  const walletInitialized = (await storeJson.read().once())?.walletInitialized
  if (!walletInitialized) {
    console.log('Fresh install detected. Initializing LND wallet')
    await initializeLnd(effects)
    await storeJson.merge(effects, { walletInitialized: true })
  }

  const osIp = await sdk.getOsIp(effects)
  const conf = (await lndConfFile.read().once())!
  if (conf['tor.socks'] !== `${osIp}:9050`) {
    await lndConfFile.merge(effects, { 'tor.socks': `${osIp}:9050` })
  }

  // TODO ensure restlisten and rpclisten are using the ContainerIP

  // restart on lnd.conf changes
  await lndConfFile.read().const(effects)

  const depResult = await sdk.checkDependencies(effects)
  depResult.throwIfNotSatisfied()

  const lndArgs: string[] = []

  const resetWalletTransactions = (await storeJson.read().const(effects))
    ?.resetWalletTransactions

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
            `${lndSub.rootfs}/data/chain/bitcoin/mainnet/admin.macaroon`,
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
        lndConfDefaults.tlscertpath,
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

  const lndDaemon = await sdk.Daemon.of(
    effects,
    lndSub,
    ['lnd', `--configfile=/data/lnd.conf`, ...lndArgs],
    {},
  )
  await lndDaemon.start()
  // Unlock wallet
  const { walletPassword, recoveryWindow } = (await storeJson
    .read()
    .const(effects))!
  do {
    const res = await lndSub.exec([
      'curl',
      '--no-progress-meter',
      'POST',
      '--cacert',
      lndConfDefaults.tlscertpath,
      'https://lnd.startos:8080/v1/unlockwallet',
      '-d',
      JSON.stringify({
        wallet_password: walletPassword,
        recovery_window: recoveryWindow,
      }),
    ])

    if (
      res.exitCode === 0 &&
      typeof res.stdout === 'string' &&
      res.stdout !== ''
    ) {
      console.log('Wallet Unlocked')
      break
    } else {
      console.log('Unlocking Wallet...')
      await sleep(10_000)
    }
  } while (true)

  // Setup watchtowers at runtime because for some reason they can't be setup in lnd.conf
  const watchtowers = (await storeJson.read().const(effects))?.watchtowers
  for (const tower of watchtowers || []) {
    console.log(`Watchtower client adding ${tower}`)
    let res = await lndSub.exec([
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

  return sdk.Daemons.of(effects, started, additionalChecks).addDaemon(
    'primary',
    {
      daemon: lndDaemon,
      ready: {
        display: 'Control Interface',
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, controlPort, {
            successMessage:
              'The Control Interface is ready to accept gRPC and REST connections',
            errorMessage: 'The Control Interface is not ready',
          }),
      },
      requires: [],
    },
  )
})

async function initializeLnd(effects: Effects) {
  // Only get leaf cert
  const cert = (await sdk.getSslCerificate(effects, ['lnd.startos']).once())
    .join('\n')
    .split('-----END CERTIFICATE-----')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => `${part}\n-----END CERTIFICATE-----`)[0]
  const key = await sdk.getSslKey(effects, { hostnames: ['lnd.startos'] })
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
      // Write cert and key
      await fs.writeFile(`${subc.rootfs}/data/tls.cert`, cert)
      await fs.writeFile(`${subc.rootfs}/data/tls.key`, key)

      const containerIp = await sdk.getContainerIp(effects).once()

      await lndConfFile.merge(effects, {
        rpclisten: `${containerIp}:10009`,
        restlisten: `${containerIp}:8080`,
      })

      const child = await subc.spawn(['lnd', `--configfile=/data/lnd.conf`])
      let cipherSeed: string[] = []
      let i = 0
      do {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          'GET',
          '--cacert',
          `/data/tls.cert`,
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
        '/data/tls.cert',
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
