import { lndConfFile } from '../file-models/lnd.conf'
import { sdk } from '../sdk'

const { InputSpec, Value, Variants, List } = sdk

const wtClientSpec = InputSpec.of({
  'wt-client': Value.union(
    {
      name: 'Enable Watchtower Client',
      description: 'Enable or disable Watchtower Client',
      default: 'disabled',
    },
    Variants.of({
      disabled: { name: 'Disabled', spec: InputSpec.of({}) },
      enabled: {
        name: 'Enabled',
        spec: InputSpec.of({
          'add-watchtowers': Value.list(
            List.text(
              {
                name: 'Add Watchtowers',
                default: [],
                description: 'Add URIs of Watchtowers to connect to.',
                minLength: 1,
              },
              {
                placeholder: 'pubkey@host:9911',
                patterns: [],
              },
            ),
          ),
        }),
      },
    }),
  ),
})

export const wtClientConfig = sdk.Action.withInput(
  // id
  'watchtower-client-config',

  // metadata
  async ({ effects }) => ({
    name: 'Watchtower Client Settings',
    description: 'Edit the Watchtower Client settings in lnd.conf',
    warning: null,
    allowedStatuses: 'any',
    group: 'watchtower',
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
  const lndConf = (await lndConfFile.read.const(effects))!
  const wtClients = lndConf['watchtower.listen']

  if (wtClients.length === 0) {
    return {
      'wt-client': {
        selection: 'disabled',
        value: {},
      },
    }
  } else {
    return {
      'wt-client': {
        selection: 'enabled',
        value: {
          'add-watchtowers': wtClients,
        },
      },
    }
  }
}

async function write(effects: any, input: WatchtowerClientSpec) {
  const watchtowerSettings = {
    'watchtower.listen':
      input['wt-client'].selection === 'enabled'
        ? input['wt-client'].value['add-watchtowers']
        : [],
  }

  await lndConfFile.merge(effects, watchtowerSettings)
}

type WatchtowerClientSpec = typeof wtClientSpec._TYPE
type PartialWatchtowerClientSpec = typeof wtClientSpec._PARTIAL
