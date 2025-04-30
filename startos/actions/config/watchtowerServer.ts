import { lndConfFile } from '../../file-models/lnd.conf'
import { sdk } from '../../sdk'
import { lndConfDefaults } from '../../utils'

const { InputSpec, Value } = sdk

// TODO add select for watchtower.externalip
const watchtowerServerSpec = InputSpec.of({
  'wt-server': Value.toggle({
    name: 'Enable Watchtower Server',
    default: lndConfDefaults['watchtower.active'],
    description:
      'Allow other nodes to find your watchtower server on the network.',
  }),
})

export const watchtowerServerConfig = sdk.Action.withInput(
  // id
  'watchtower-server-config',

  // metadata
  async ({ effects }) => ({
    name: 'Watchtower Server',
    description: 'Enable Watchtower Server in lnd.conf',
    warning: null,
    allowedStatuses: 'any',
    group: 'watchtower',
    visibility: 'enabled',
  }),

  // form input specification
  watchtowerServerSpec,

  // optionally pre-fill the input form
  ({ effects }) => read(effects),

  // the execution function
  ({ effects, input }) => write(effects, input),
)

async function read(effects: any): Promise<WatchtowerServerSpec> {
  const lndConf = (await lndConfFile.read.const(effects))!

  return {
    'wt-server': lndConf['watchtower.active'],
  }
}

async function write(effects: any, input: PartialWatchtowerServerSpec) {
  await lndConfFile.merge(effects, { 'watchtower.active': input['wt-server'] })
}

type WatchtowerServerSpec = typeof watchtowerServerSpec._TYPE
type PartialWatchtowerServerSpec = typeof watchtowerServerSpec._PARTIAL
