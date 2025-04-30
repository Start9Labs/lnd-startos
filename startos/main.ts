import { sdk } from './sdk'
import { T } from '@start9labs/start-sdk'
import { controlPort, GetInfo, mainMounts } from './utils'
import { readFile } from 'fs'

export const main = sdk.setupMain(async ({ effects, started }) => {
  /**
   * ======================== Setup (optional) ========================
   *
   * In this section, we fetch any resources or run any desired preliminary commands.
   */
  console.info('Starting LND!')

  const depResult = await sdk.checkDependencies(effects)
  depResult.throwIfNotSatisfied()

  const lndArgs: string[] = []

  const resetWalletTransactions = await sdk.store
    .getOwn(effects, sdk.StorePath.resetWalletTransactions)
    .const()

  if (resetWalletTransactions) lndArgs.push('--reset-wallet-transactions')

  /**
   * ======================== Additional Health Checks (optional) ========================
   *
   * In this section, we define *additional* health checks beyond those included with each daemon (below).
   */
  const lndSub = await sdk.SubContainer.of(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'lnd-sub',
  )

  let macHex: string;
  readFile('/data/bitcoin/mainnet/admin.macaroon', (err, data) => {
    if (err) throw err

    macHex = data.toString('hex')
  });

  const syncCheck = sdk.HealthCheck.of(effects, {
    id: 'sync-progress',
    name: 'Blockchain and Graph Sync Progress',
    fn: async () => {
      const res = await lndSub.exec([
        'curl',
        '--no-progress-meter',
        '--header',
        `Grpc-Metadata-macaroon: ${macHex}`,
        '--cacert',
        '/data/.lnd/tls.cert',
        'https://lnd.startos:8080/v1/getinfo',
      ])

      if (res.stdout !== '' && typeof res.stdout === 'string') {
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

      if (res.stderr.includes('rpc error: code = Unknown desc = waiting to start')) {
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
  return sdk.Daemons.of(effects, started, additionalChecks).addDaemon(
    'primary',
    {
      subcontainer: lndSub,
      command: ['lnd', ...lndArgs],
      ready: {
        display: 'Control Interface',
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, controlPort, {
            successMessage: 'The control interface is ready to accept gRPC and REST connections',
            errorMessage: 'The control interface is not ready',
          }),
      },
      requires: [],
    },
  )
})
