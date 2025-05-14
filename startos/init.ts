import { sdk } from './sdk'
import { setDependencies } from './dependencies'
import { peerInterfaceId, setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults, mainMounts, randomPassword, sleep } from './utils'
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
