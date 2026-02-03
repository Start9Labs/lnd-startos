import { i18n } from '../i18n'
import { backendConfig } from '../actions/config/backend'
import { sdk } from '../sdk'

export const taskSetBackend = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    await sdk.action.createOwnTask(effects, backendConfig, 'critical', {
      reason: i18n('LND needs to know what Bitcoin backend should be used'),
    })
  }
})
