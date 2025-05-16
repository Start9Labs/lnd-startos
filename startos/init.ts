import { sdk } from './sdk'
import { setDependencies } from './dependencies'
import { peerInterfaceId, setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults, randomPassword } from './utils'
import { backendConfig } from './actions/config/backend'
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
    walletInitialized: false,
  })
})

const postInstall = sdk.setupPostInstall(async ({ effects }) => {
  const peerOnionUrl = await sdk.serviceInterface
    .getOwn(effects, peerInterfaceId)
    .once()

  await lndConfFile.merge(effects, {
    externalhosts: peerOnionUrl?.addressInfo?.publicUrls || [],
  })

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
