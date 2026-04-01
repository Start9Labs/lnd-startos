import {
  fullConfigSpec,
  formToFile,
  lndConfFile,
} from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const wtClientConfig = sdk.Action.withInput(
  // id
  'watchtower-client-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Watchtower Client Settings'),
    description: i18n('Edit the Watchtower Client settings in lnd.conf'),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Watchtower'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'wt-client': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => {
    const wtClients =
      (await storeJson.read().const(effects))?.watchtowerClients || []
    if (wtClients.length === 0) {
      return { 'wt-client': { selection: 'disabled' as const, value: {} } }
    }
    return {
      'wt-client': {
        selection: 'enabled' as const,
        value: { 'add-watchtowers': wtClients },
      },
    }
  },

  // the execution function
  async ({ effects, input }) => {
    if (input['wt-client'].selection === 'enabled') {
      await storeJson.merge(effects, {
        watchtowerClients: input['wt-client'].value['add-watchtowers'] || [],
      })
    } else {
      await storeJson.merge(effects, { watchtowerClients: [] })
    }
    await lndConfFile.merge(effects, formToFile(input))
  },
)
