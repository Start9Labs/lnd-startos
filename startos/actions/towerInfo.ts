import { lndConfFile } from '../fileModels/lnd.conf'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { mainMounts } from '../utils'

export const towerInfo = sdk.Action.withoutInput(
  // id
  'tower-info',

  // metadata
  async ({ effects }) => ({
    name: i18n('Watchtower Server Info'),
    description: i18n('Get your Tower Server URL'),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Watchtower'),
    visibility: (await lndConfFile
      .read((c) => c['watchtower.active'])
      .const(effects))
      ? 'enabled'
      : { disabled: i18n('Watchtower Server must be enabled') },
  }),

  // the execution function
  async ({ effects }) => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'tower-info',
      async (subc) => {
        return subc.execFail([
          'lncli',
          '--rpcserver=lnd.startos',
          'tower',
          'info',
        ])
      },
    )

    if (res.stdout !== '' && typeof res.stdout === 'string') {
      const parsedRes: {
        pubkey: string
        listeners: string[]
        uris: string[]
      } = JSON.parse(res.stdout)
      return {
        version: '1',
        title: i18n('Tower Info'),
        message: i18n(
          'Sharing this URL with other LND nodes will allow them to use your server as a watchtower.',
        ),
        result: {
          type: 'single',
          value: parsedRes.uris[0],
          copyable: true,
          qr: true,
          masked: true,
        },
      }
    } else {
      return {
        version: '1',
        title: i18n('Tower Info'),
        message: i18n('Error fetching tower info'),
        result: {
          type: 'single',
          value: JSON.stringify(res.stderr),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    }
  },
)
