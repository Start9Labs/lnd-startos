import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { GetInfo, mainMounts } from '../utils'

export const nodeInfo = sdk.Action.withoutInput(
  // id
  'node-info',

  // metadata
  async ({ effects }) => ({
    name: i18n('Node Info'),
    description: i18n('Get info about your LND node'),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  // the execution function
  async ({ effects }): Promise<T.ActionResult & { version: '1' }> => {
    const getInfoRes = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'get-info',
      async (subc) => {
        return await subc.exec(['lncli', '--rpcserver=lnd.startos', 'getinfo'])
      },
    )

    if (getInfoRes.exitCode !== 0 || typeof getInfoRes.stdout !== 'string') {
      return {
        version: '1' as const,
        title: i18n('Node Info'),
        message: i18n('Error fetching node info'),
        result: {
          type: 'single' as const,
          value: JSON.stringify(getInfoRes.stderr),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    }

    const getInfo: GetInfo = JSON.parse(getInfoRes.stdout)

    return {
      version: '1' as const,
      title: i18n('Node Info'),
      message: i18n('Information about your LND node.'),
      result: {
        type: 'group' as const,
        value: [
          {
            name: i18n('Node Alias'),
            description: i18n('The friendly identifier for your node'),
            type: 'single' as const,
            value: getInfo.alias,
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: i18n('Node Id'),
            description: i18n(
              'The node identifier that other nodes can use to connect to this node',
            ),
            type: 'single' as const,
            value: getInfo.identity_pubkey,
            copyable: true,
            qr: false,
            masked: true,
          },
          {
            name: i18n('Node URI(s)'),
            description: i18n(
              'URI(s) to allow other nodes to peer with your node',
            ),
            type: 'group' as const,
            value: getInfo.uris.length
              ? getInfo.uris.map((uri, i) => ({
                  name: `${i18n('Node URI')} ${i + 1}`,
                  description: null,
                  type: 'single' as const,
                  value: uri,
                  copyable: true,
                  qr: true,
                  masked: true,
                }))
              : [
                  {
                    name: i18n('Node URI'),
                    description: i18n(
                      'Add a Peer URL in LND > Dashboard > Peer Interface > Add',
                    ),
                    type: 'single' as const,
                    value: i18n('No Peer Addresses found'),
                    copyable: false,
                    qr: false,
                    masked: false,
                  },
                ],
          },
        ],
      },
    }
  },
)
