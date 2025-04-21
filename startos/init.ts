import { sdk } from './sdk'
import { exposedStore } from './store'
import { setDependencies } from './dependencies/dependencies'
import { setInterfaces } from './interfaces'
import { migrations } from './migrations'
import { utils } from '@start9labs/start-sdk'
import { randomPassword } from './utils'

const install = sdk.setupInstall(async ({ effects }) => {
  const walletPassword = utils.getDefaultString(randomPassword)

  await sdk.store.setOwn(
    effects, sdk.StorePath, {
      walletPassword,
      recoveryWindow: 200 // TODO default

    }
  )
})

const uninstall = sdk.setupUninstall(async ({ effects }) => {})

/**
 * Plumbing. DO NOT EDIT.
 */
export const { init, uninit } = sdk.setupInit(
  migrations,
  install,
  uninstall,
  setInterfaces,
  setDependencies,
  exposedStore,
)
