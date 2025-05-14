import { lndConfFile } from '../../file-models/lnd.conf'
import { sdk } from '../../sdk'
import { getExteralAddresses } from '../../utils'

const { InputSpec } = sdk

const watchtowerServerSpec = InputSpec.of({
  'watchtower.externalip': getExteralAddresses(),
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
    group: 'Watchtower',
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
  const lndConf = (await lndConfFile.read().const(effects))!

  return {
    'watchtower.externalip': lndConf['watchtower.externalip']
      ? lndConf['watchtower.externalip']
      : 'none',
  }
}

async function write(effects: any, input: WatchtowerServerSpec) {
  const watchtowerEnabled = input['watchtower.externalip'] !== 'none'

  let watchtowerSettings
  if (watchtowerEnabled) {
    watchtowerSettings = {
      'watchtower.active': true,
      'watchtower.listen': ['0.0.0.0:9911'],
      'watchtower.externalip': input['watchtower.externalip'],
    }
  } else {
    watchtowerSettings = {
      'watchtower.active': false,
      'watchtower.listen': undefined,
      'watchtower.externalip': undefined,
    }
  }

  await lndConfFile.merge(effects, watchtowerSettings)
}

type WatchtowerServerSpec = typeof watchtowerServerSpec._TYPE
