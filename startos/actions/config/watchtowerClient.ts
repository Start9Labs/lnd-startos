import { i18n } from '../../i18n'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { storeJson } from '../../fileModels/store.json'
import { sdk } from '../../sdk'

const { InputSpec, Value, Variants, List } = sdk

const wtClientSpec = InputSpec.of({
  'wt-client': Value.union({
    name: i18n('Enable Watchtower Client'),
    description: i18n('Enable or disable Watchtower Client'),
    default: 'disabled',
    variants: Variants.of({
      disabled: { name: i18n('Disabled'), spec: InputSpec.of({}) },
      enabled: {
        name: i18n('Enabled'),
        spec: InputSpec.of({
          'add-watchtowers': Value.list(
            List.text(
              {
                name: i18n('Add Watchtowers'),
                default: [],
                description: i18n('Add URIs of Watchtowers to connect to.'),
                minLength: 1,
              },
              { placeholder: 'pubkey@host:9911', patterns: [] },
            ),
          ),
        }),
      },
    }),
  }),
})

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
  wtClientSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<WatchtowerClientSpec> {
  const wtClients = (await storeJson.read().const(effects))?.watchtowers || []

  if (wtClients.length === 0) {
    return { 'wt-client': { selection: 'disabled', value: {} } }
  } else {
    return {
      'wt-client': {
        selection: 'enabled',
        value: { 'add-watchtowers': wtClients },
      },
    }
  }
}

async function write(effects: any, input: WatchtowerClientSpec) {
  const watchtowerSettings = {
    'wtclient.active': input['wt-client'].selection === 'enabled',
  }

  if (input['wt-client'].selection === 'enabled') {
    await storeJson.merge(effects, {
      watchtowers: input['wt-client'].value['add-watchtowers'] || [],
    })
  } else {
    await storeJson.merge(effects, {
      watchtowers: [],
    })
  }

  await lndConfFile.merge(effects, watchtowerSettings)
}

type WatchtowerClientSpec = typeof wtClientSpec._TYPE
type PartialWatchtowerClientSpec = typeof wtClientSpec._PARTIAL
