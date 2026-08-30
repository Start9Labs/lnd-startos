import { rm } from 'fs/promises'
import { lndConfFile } from '../../fileModels/lnd.conf'
import { i18n } from '../../i18n'
import { watchtowerHostId, watchtowerInterfaceId } from '../../interfaces'
import { sdk } from '../../sdk'
import { watchtowerServerDir } from '../../utils'

const { InputSpec } = sdk

const watchtowerServerSpec = InputSpec.of({
  'watchtower.externalip': getExternalAddresses(),
})

export const watchtowerServerConfig = sdk.Action.withInput(
  // id
  'watchtower-server-config',

  // metadata
  async ({ effects }) => ({
    name: i18n('Watchtower - Server'),
    description: i18n('Enable Watchtower Server in lnd.conf'),
    warning: i18n(
      "Setting the address to 'none' disables the watchtower server and permanently deletes the backup data it holds for the client nodes that rely on it. This cannot be undone.",
    ),
    allowedStatuses: 'any',
    group: i18n('Security'),
    visibility: 'enabled',
  }),

  // form input specification
  watchtowerServerSpec,

  // optionally pre-fill the input form
  async ({ effects }) => ({
    'watchtower.externalip':
      (await lndConfFile.read((c) => c['watchtower.externalip']).once()) ||
      'none',
  }),

  // the execution function
  async ({ effects, input }) => {
    const address = input['watchtower.externalip']
    const watchtowerEnabled = !!address && address !== 'none'

    await lndConfFile.merge(
      effects,
      watchtowerEnabled
        ? {
            'watchtower.active': true,
            'watchtower.listen': ['0.0.0.0:9911'],
            'watchtower.externalip': address,
          }
        : {
            'watchtower.active': false,
            'watchtower.listen': undefined,
            'watchtower.externalip': undefined,
          },
    )

    if (!watchtowerEnabled) {
      await rm(watchtowerServerDir, { recursive: true, force: true })
    }
  },
)

export function getExternalAddresses() {
  return sdk.Value.dynamicSelect(async ({ effects }) => {
    const urls = await sdk.host
      .getOwn(effects, watchtowerHostId, (host) => {
        const iface =
          host &&
          Object.values(host.bindings)
            .flatMap((b) => Object.values(b.interfaces))
            .find((i) => i.id === watchtowerInterfaceId)
        return iface ? iface.addressInfo.public.format() : []
      })
      .const()

    if (urls.length === 0) {
      return {
        name: i18n('External Address'),
        description: i18n(
          'No available address at which your watchtower can be reached by LND peers.',
        ),
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
      name: i18n('External Address'),
      description: i18n(
        "Address at which your node can be reached by peers. Select 'none' to disable the watchtower server.",
      ),
      values: urlsWithNone,
      default: urls.find((u) => u.endsWith('.onion')) || 'none',
    }
  })
}
