import { lndConfFile } from '../../fileModels/lnd.conf'
import { sdk } from '../../sdk'

const { InputSpec } = sdk

const watchtowerServerSpec = InputSpec.of({
  'watchtower.externalip': getExternalAddresses(),
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

export function getExternalAddresses() {
  return sdk.Value.dynamicSelect(async ({ effects }) => {
    const peerInterface = await sdk.serviceInterface
      .getOwn(effects, 'peer')
      .const()

    const urls = peerInterface?.addressInfo?.publicUrls || []

    if (urls.length === 0) {
      return {
        name: 'External Address',
        description:
          'No available address at which your watchtower can be reached by LND peers.',
        values: { none: 'none' },
        default: 'none',
      }
    }

    const urlsWithNone = urls.reduce(
      (obj, url) => ({
        ...obj,
        [url]: url,
      }),
      {} as Record<string, string>,
    )

    urlsWithNone['none'] = 'none'

    return {
      name: 'External Address',
      description:
        "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.",
      values: urlsWithNone,
      default: urls.find((u) => u.endsWith('.onion')) || '',
    }
  })
}
