import { sdk } from './sdk'
import { exposedStore, initStore } from './store'
import { setDependencies } from './dependencies'
import { setInterfaces } from './interfaces'
import { versions } from './versions'
import { actions } from './actions'
import { lndConfFile } from './file-models/lnd.conf'
import { lndConfDefaults } from './utils'

const preInstall = sdk.setupPreInstall(async ({ effects }) => {
  await lndConfFile.write(effects, lndConfDefaults)
})

const postInstall = sdk.setupPostInstall(async ({ effects }) => {})

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
