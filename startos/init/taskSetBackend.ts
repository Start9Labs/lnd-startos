import { backendConfig } from '../actions/config/backend'
import { sdk } from '../sdk'

export const taskSetBackend = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    await sdk.action.createOwnTask(effects, backendConfig, 'critical', {
      reason: 'LND needs to know what Bitcoin backend should be used',
    })
  }
})
