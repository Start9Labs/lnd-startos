import { backendConfig } from '../actions/backend'
import { initializeWallet } from '../actions/initializeWallet'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const tasksOnInstall = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    await sdk.action.createOwnTask(effects, initializeWallet, 'critical', {
      reason: i18n('LND needs a wallet to operate'),
    })
    await sdk.action.createOwnTask(effects, backendConfig, 'critical', {
      reason: i18n('LND needs to know what Bitcoin backend should be used'),
    })
  }
})
