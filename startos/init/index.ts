import { sdk } from '../sdk'
import { setDependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { versionGraph } from '../install/versionGraph'
import { actions } from '../actions'
import { restoreInit } from '../backups'
import { watchHosts } from './watchHosts'
import { setupCerts } from './setupCerts'
import { taskSetBackend } from './taskSetBackend'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  setInterfaces,
  setDependencies,
  actions,
  watchHosts,
  setupCerts,
  taskSetBackend,
)

export const uninit = sdk.setupUninit(versionGraph)
