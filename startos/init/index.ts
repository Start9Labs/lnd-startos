import { actions } from '../actions'
import { restoreInit } from '../backups'
import { setDependencies } from '../dependencies'
import { versionGraph } from '../versions'
import { setInterfaces } from '../interfaces'
import { sdk } from '../sdk'
import { seedFiles } from './seedFiles'
import { setupCerts } from './setupCerts'
import { taskConfigureChannelBackup } from './taskConfigureChannelBackup'
import { tasksOnInstall } from './tasksOnInstall'
import { watchHosts } from './watchHosts'
import { watchTorDns } from './watchTorDns'
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
  watchTorDns,
  tasksOnInstall,
  taskConfigureChannelBackup,
)

export const uninit = sdk.setupUninit(versionGraph)
