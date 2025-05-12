import { sdk } from './sdk'
import { setDependencies } from './dependencies'
import { peerInterfaceId, setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults, mainMounts, randomPassword } from './utils'
import { backendConfig } from './actions/config/backend'
import { SIGTERM } from '@start9labs/start-sdk/base/lib/types'
import * as fs from 'node:fs/promises'
import { storeJson } from './file-models/store.json'
import { utils } from '@start9labs/start-sdk'

const preInstall = sdk.setupPreInstall(async ({ effects }) => {
  await lndConfFile.write(effects, lndConfDefaults)
  await storeJson.write(effects, {
    aezeedCipherSeed: null,
    walletPassword: utils.getDefaultString(randomPassword),
    recoveryWindow: 2_500,
    bitcoindSelected: false,
    restore: false,
    resetWalletTransactions: false,
    watchtowers: [],
  })
})

const postInstall = sdk.setupPostInstall(async ({ effects }) => {
  const cert = await sdk.getSslCerificate(effects, ['lnd.startos']).once()
  cert.join('\n')
  const key = await sdk.getSslKey(effects, { hostnames: ['lnd.startos'] })
  const formattedKey = key.replace(
    '/(?:BEGIN|END) PRIVATE KEY/g',
    '$1 EC PRIVATE KEY',
  )
  console.log('FMA Cert: ', cert)
  console.log('FMA key: ', formattedKey)
  await sdk.SubContainer.withTemp(
    effects,
    {
      imageId: 'lnd',
    },
    mainMounts,
    'initialize-lnd',
    async (subc) => {
      // Write cert and key
      // await fs.mkdir(`${subc.rootfs}/data/.lnd`, { recursive: true })
      console.log('FMA rootfs: ', subc.rootfs)
      try {
        await fs.writeFile(`/data/tls.cert`, cert)
        console.log('FMA Succeeded to write File')
      } catch (err) {
        console.log('FMA Failed to write File: ', err)
      }
      await fs.writeFile(`${subc.rootfs}/tls.key`, formattedKey)
      console.log('FMA ls:')
      await subc.exec(['ls', '-a', subc.rootfs])

      const child = await subc.spawn(['lnd', '--conf='])
      let cipherSeed: string[] = []
      do {
        const res = await subc.exec([
          'curl',
          '--no-progress-meter',
          '-X',
          'GET',
          '--cacert',
          '/tls.cert',
          '--fail-with-body',
          'https://lnd.startos:8080/v1/genseed',
        ])
        if (
          res.exitCode === 0 &&
          res.stdout !== '' &&
          typeof res.stdout === 'string'
        ) {
          cipherSeed = res.stdout.trim().split(/\s+/)
          break
        } else {
          console.log('Waiting for RPC to start...')
          await sleep(5_000)
          break
        }
      } while (true)

      console.log('FMA CipherSeed: ', cipherSeed)

      const walletPassword = (await storeJson.read().once())?.walletPassword

      const status = await subc.exec([
        'curl',
        '--no-progress-meter',
        '-X',
        'POST',
        '--cacert',
        '/tls.cert',
        '--fail-with-body',
        'https://lnd.startos:8080/v1/initwallet',
        '-d',
        `${JSON.stringify({
          wallet_password: walletPassword,
          cipher_seed_mnemonic: cipherSeed,
        })}`,
      ])

      console.log('FMA Wallet Password: ', walletPassword)

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

  const peerOnionUrl = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .once()

  if (peerOnionUrl?.addressInfo?.publicUrls[0]) {
    await lndConfFile.merge(effects, {
      externalhosts: [peerOnionUrl?.addressInfo?.publicUrls[0]],
    })
  }

  await sdk.action.requestOwn(effects, backendConfig, 'critical', {
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
)

function sleep(ms: any) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
