import { fullConfigSpec } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { sdk } from '../../sdk'
import { i18n } from '../../i18n'

export const customExternalHostConfig = sdk.Action.withInput(
  // id
  'custom-external-host-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Custom External Host'),
    description: i18n(
      'Advertise an additional public address (e.g. a Tunnelsats or VPN endpoint) alongside your Tor and StartOS-managed addresses',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: i18n('Configuration'),
    visibility: 'enabled',
  }),

  // form input specification
  fullConfigSpec.filter({
    'custom-external-host': true,
  }),

  // optionally pre-fill the input form
  async ({ effects }) => ({
    'custom-external-host':
      (await storeJson.read().const(effects))?.customExternalHosts[0] ?? null,
  }),

  // the execution function — source of truth is the store; watchHosts merges it
  // into externalhosts in lnd.conf, so we never write the conf from here.
  async ({ effects, input }) => {
    const host = input['custom-external-host']?.trim()
    await storeJson.merge(effects, {
      customExternalHosts: host ? [host] : [],
    })
  },
)
