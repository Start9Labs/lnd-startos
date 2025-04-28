import { sdk } from './sdk'
import { exposedStore, initStore } from './store'
import { setDependencies } from './dependencies'
import { peerInterfaceId, setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults } from './utils'
import { backendConfig } from './actions/config/backend'

const preInstall = sdk.setupPreInstall(async ({ effects }) => {
  await lndConfFile.write(effects, lndConfDefaults)
})

const postInstall = sdk.setupPostInstall(async ({ effects }) => {
  // TODO get peer url and push to externalhosts in config.
  const peerOnionUrl = await sdk.serviceInterface.getOwn(effects, peerInterfaceId).once()
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
