import { lndConfFile } from '../file-models/lnd.conf'
import { sdk } from '../sdk'
import { mainMounts, TowerInfo } from '../utils'

export const towerInfo = sdk.Action.withoutInput(
  // id
  'tower-info',

  // metadata
  async ({ effects }) => ({
    name: 'Watchtower Server Info',
    description: 'Get your Tower Server URL',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'watchtower',
    visibility: (await lndConfFile.read().const(effects))!['watchtower.active']
      ? 'enabled'
      : 'hidden',
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
      const parsedRes: TowerInfo = JSON.parse(res.stdout)
      return {
        version: '1',
        title: 'Tower Info',
        message:
          'Sharing this URL with other LND nodes will allow them to use your server as a watchtower.',
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
        title: 'Tower Info',
        message: 'Error fetching tower info',
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
