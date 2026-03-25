import { actions } from '../actions'
import { restoreInit } from '../backups'
import { setDependencies } from '../dependencies'
import { versionGraph } from '../versions'
import { setInterfaces } from '../interfaces'
import { sdk } from '../sdk'
import { seedFiles } from './seedFiles'
import { setupCerts } from './setupCerts'
import { tasksOnInstall } from './tasksOnInstall'
import { watchHosts } from './watchHosts'
import { watchTorSocks } from './watchTorSocks'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedFiles,
  setInterfaces,
  setDependencies,
  actions,
  setupCerts,
  watchHosts,
  watchTorSocks,
  tasksOnInstall,
)

export const uninit = sdk.setupUninit(versionGraph)
