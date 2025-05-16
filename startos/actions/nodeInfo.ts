import { ActionResultMember } from '@start9labs/start-sdk/base/lib/osBindings'
import { peerInterfaceId } from '../interfaces'
import { sdk } from '../sdk'
import { GetInfo, mainMounts } from '../utils'

export const nodeInfo = sdk.Action.withoutInput(
  // id
  'node-info',

  // metadata
  async ({ effects }) => ({
    name: 'Node Info',
    description: 'Get info about your LND node',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  // the execution function
  async ({ effects }) => {
    const getInfoRes = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'get-info',
      async (subc) => {
        return await subc.exec(['lncli', '--rpcserver=lnd.startos', 'getinfo'])
      },
    )
    if (getInfoRes.exitCode === 0 && typeof getInfoRes.stdout === 'string') {
      const getInfo: GetInfo = JSON.parse(getInfoRes.stdout)

      const peerAddresses = (
        await sdk.serviceInterface.getOwn(effects, peerInterfaceId).const()
      )?.addressInfo?.publicUrls

      const noPeerAddresses: ActionResultMember = {
        name: 'Node URI',
        type: 'single',
        value: 'No Peer Addresses found',
        description: 'Add a Peer URL in LND > Dashboard > Peer Interface > Add',
        copyable: false,
        qr: false,
        masked: false,
      }

      return {
        version: '1',
        title: 'Node Info',
        message: 'Information for connecting to your LND node and peers.',
        result: {
          type: 'group',
          value: [
            {
              name: 'Node Alias',
              description: 'The friendly identifier for your node',
              type: 'single',
              value: getInfo.alias,
              copyable: true,
              qr: false,
              masked: false,
            },
            {
              name: 'Node Id',
              type: 'single',
              value: getInfo.identity_pubkey,
              description:
                'The node identifier that other nodes can use to connect to this node',
              copyable: true,
              qr: false,
              masked: true,
            },
            {
              name: 'Node URI(s)',
              type: 'group',
              description: 'URI(s) to allow other nodes to peer with your node',
              value: peerAddresses?.map((e, i) => {
                return {
                  name: `Node URI ${i + 1}`,
                  type: 'single',
                  value: `${getInfo.identity_pubkey}@${e}`,
                  description: null,
                  copyable: true,
                  qr: true,
                  masked: true,
                }
              }) || [noPeerAddresses],
            },
          ],
        },
      }
    } else {
      return {
        version: '1',
        title: 'Node Info',
        message: 'Error fetching node info',
        result: {
          type: 'single',
          value: JSON.stringify(getInfoRes.stderr),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    }
  },
)
