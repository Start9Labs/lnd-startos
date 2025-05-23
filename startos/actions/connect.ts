import { sdk } from '../sdk'
import { lndDataDir, mainMounts } from '../utils'
import { readFile } from 'fs/promises'
import { lndConfFile } from '../fileModels/lnd.conf'
import { controlInterfaceId } from '../interfaces'

export const connect = sdk.Action.withoutInput(
  // id
  'connect',

  // metadata
  async ({ effects }) => ({
    name: 'Connect to LND',
    description: 'View options to connect to your LND node',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  // the execution function
  async ({ effects }) => {
    const controlAddresses = (
      await sdk.serviceInterface.getOwn(effects, controlInterfaceId).const()
    )?.addressInfo?.publicUrls
    // const controlAddresses = [
    //   await lndConfFile.read((e) => e.restlisten).const(effects),
    // ].flat()

    const noControlAddresses = {
      version: '1',
      title: 'Node Control',
      message: 'No Control Addresses found',
      result: {
        type: 'single',
        value: 'Add a Control URL in LND > Dashboard > Control Interface > Add',
        copyable: true,
        qr: false,
        masked: false,
      },
    } as const

    if (!controlAddresses) return noControlAddresses
    let base64MacaroonUrl: string = ''
    let base64CertUrl: string = ''

    const { mac, cert } = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'get-connection-info',
      async (subc) => {
        try {
          const mac = (
            await readFile(
              `${subc.rootfs}/${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`,
            )
          ).toString('hex')
          const cert = (
            await readFile(`${subc.rootfs}/${lndDataDir}/tls.cert`)
          ).toString('base64url')
          return { mac, cert }
        } catch (err) {
          return {
            version: '1' as const,
            title: 'Node Info',
            message: 'Error fetching node info',
            result: {
              type: 'single',
              value: JSON.stringify(err),
              copyable: true,
              qr: false,
              masked: false,
            },
          }
        }
      },
    )

    // try {
    //   base64MacaroonUrl = (
    //     await readFile(
    //       `${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`,
    //     )
    //   ).toString('base64url')
    //   base64CertUrl = (await readFile(`${lndDataDir}/tls.cert`)).toString(
    //     'base64url',
    //   )
    return {
      version: '1',
      title: 'Node Connection Options',
      message: 'Information for connecting to your LND node.',
      result: {
        type: 'group',
        value: [
          {
            name: 'LND Connect REST URL(s)',
            type: 'group',
            description: 'REST URL(s) for clients to connect with LND',
            value: controlAddresses.map((e, i) => {
              return {
                name: `REST URL ${i + 1}`,
                type: 'single',
                value: `lndconnect://${e.split('://', 2)[1]}:8080?macaroon=${mac}`,
                description: null,
                copyable: true,
                qr: true,
                masked: true,
              }
            }),
          },
          {
            name: 'LND Connect gRPC URL(s)',
            type: 'group',
            description: 'gRPC URL(s) for clients to connect with LND',
            value: controlAddresses.map((e, i) => {
              return {
                name: `gRPC URL ${i + 1}`,
                type: 'single',
                value: `lndconnect://${e.split('://', 2)[1]}:10009?cert=${cert}&macaroon=${mac}`,
                description: null,
                copyable: true,
                qr: true,
                masked: true,
              }
            }),
          },
        ],
      },
    }
    // } catch (err) {
    // return {
    //   version: '1' as const,
    //   title: 'Node Info',
    //   message: 'Error fetching node info',
    //   result: {
    //     type: 'single',
    //     value: JSON.stringify(err),
    //     copyable: true,
    //     qr: false,
    //     masked: false,
    //   },
    // }
    // }
    // return noControlAddresses
  },
)
