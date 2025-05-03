import { sdk } from './sdk'
import { exposedStore, initStore } from './store'
import { setDependencies } from './dependencies'
import { peerInterfaceId, setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults, mainMounts } from './utils'
import { backendConfig } from './actions/config/backend'

const preInstall = sdk.setupPreInstall(async ({ effects }) => {
  await lndConfFile.write(effects, lndConfDefaults)
})

/*
  TODO confirm with Aiden exec vs exec fail and subc.spawn vs sdk.SubContainer.withTemp
*/

const postInstall = sdk.setupPostInstall(async ({ effects }) => {
  await sdk.SubContainer.withTemp(
    effects,
    {
      imageId: 'lnd',
    },
    // TODO cp system cert or mount the OS directory
    mainMounts,
    'initialize-lnd',
    async (subc) => {
      await subc.spawn(['lnd'])
      let cipherSeedCreated = false
      let cipherSeed: string[] = []
      do {
        const res = await subc.execFail([
          'curl',
          '--no-progress-meter',
          '-X',
          'GET',
          '--cacert',
          '/data/.lnd/tls.cert',
          'https://lnd.startos:8080/v1/genseed',
          '-d',
        ])

        if (res.stdout !== '' && typeof res.stdout === 'string') {
          cipherSeed = res.stdout.trim().split(/\s+/)
          cipherSeedCreated = true
        } else {
          console.log('Waiting for RPC to start...')
          await sleep(5_000)
        }
      } while (!cipherSeedCreated)

      const walletPassword = await sdk.store
        .getOwn(effects, sdk.StorePath.walletPassword)
        .once()

      const status = await subc.execFail([
        'curl',
        '--no-progress-meter',
        '-X',
        'POST',
        '--cacert',
        '/data/.lnd/tls.cert',
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

      await sdk.store.setOwn(
        effects,
        sdk.StorePath.aezeedCipherSeed,
        cipherSeed,
      )
    },
  )

  const peerOnionUrl = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .once()

  if (peerOnionUrl?.addressInfo?.publicUrls[0]) {
    await lndConfFile.merge(effects, {
      externalhosts: [peerOnionUrl?.addressInfo?.publicUrls[0]],
    })
  }

  sdk.action.requestOwn(effects, backendConfig, 'critical', {
    reason: 'LND needs to know what Bitcoin backend should be used',
  })
})

const uninstall = sdk.setupUninstall(async ({ effects }) => {})

/**
 * Plumbing. DO NOT EDIT.
 */
export const { packageInit, packageUninit, containerInit } = sdk.setupInit(
  versions,
  preInstall,
  postInstall,
  uninstall,
  setInterfaces,
  setDependencies,
  actions,
  initStore,
  exposedStore,
)

function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
