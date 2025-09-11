import { sdk } from './sdk'
import { lndConfFile } from './fileModels/lnd.conf'
import { lndDataDir, mainMounts } from './utils'
import { readFile } from 'fs/promises'
import { FileHelper } from '@start9labs/start-sdk'

export const restPort = 8080
export const gRPCPort = 10009
export const peerPort = 9735
export const watchtowerPort = 9911

export const peerInterfaceId = 'peer'
export const gRPCInterfaceId = 'grpc'
export const controlInterfaceId = 'control'
export const lndconnectRestId = 'lnd-connect-rest'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  // REST and gRPC
  try {
    const { macaroon, cert } = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'get-connection-info',
      async (subc) => {
        const macPath = `${subc.rootfs}${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`
        const certPath = `${subc.rootfs}${lndDataDir}/tls.cert`

        await FileHelper.string(macPath).read().const(effects)
        await FileHelper.string(certPath).read().const(effects)

        const macaroon = await readFile(macPath).then((buf) =>
          Buffer.from(buf).toString('base64url'),
        )
        const cert = await readFile(macPath).then((buf) =>
          Buffer.from(buf).toString('base64url'),
        )
        return { macaroon, cert }
      },
    )

    const restMulti = sdk.MultiHost.of(effects, 'rest-multi')
    const restMultiOrigin = await restMulti.bindPort(restPort, {
      protocol: 'https',
      preferredExternalPort: restPort,
      addSsl: {
        alpn: null,
        preferredExternalPort: restPort,
      },
    })

    const lndConnect = sdk.createInterface(effects, {
      name: 'REST LND Connect',
      id: lndconnectRestId,
      description: 'Used for REST connections',
      type: 'api',
      masked: false,
      schemeOverride: { ssl: 'lndconnect', noSsl: 'lndconnect' },
      username: null,
      path: '',
      query: {
        macaroon: macaroon,
      },
    })
    const restReceipt = await restMultiOrigin.export([lndConnect])
    receipts.push(restReceipt)

    const gRPCMulti = sdk.MultiHost.of(effects, 'grpc-multi')
    const gRPCMultiOrigin = await gRPCMulti.bindPort(gRPCPort, {
      protocol: 'https',
      preferredExternalPort: gRPCPort,
      addSsl: {
        alpn: null,
        preferredExternalPort: gRPCPort,
      },
    })

    const lndgRpcConnect = sdk.createInterface(effects, {
      name: 'gRPC LND Connect',
      id: gRPCInterfaceId,
      description: 'Used for gRPC connections',
      type: 'api',
      masked: false,
      schemeOverride: { ssl: 'lndconnect', noSsl: 'lndconnect' },
      username: null,
      path: '',
      query: {
        cert,
        macaroon,
      },
    })
    const gRPCReceipt = await gRPCMultiOrigin.export([lndgRpcConnect])
    receipts.push(gRPCReceipt)
  } catch {
    console.log('waiting for admin.macaroon to be created...')
  }

  // peer
  const peerMulti = sdk.MultiHost.of(effects, 'peer-multi')
  const peerMultiOrigin = await peerMulti.bindPort(peerPort, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: peerPort,
    secure: { ssl: false },
  })
  const peer = sdk.createInterface(effects, {
    name: 'Peer Interface',
    id: peerInterfaceId,
    description: 'Used for connecting with peers',
    type: 'p2p',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await peerMultiOrigin.export([peer]))

  if ((await lndConfFile.read().once())?.['watchtower.active']) {
    // watchtower
    const watchtowerMulti = sdk.MultiHost.of(effects, 'watchtower-multi')
    const watchtowerMultiOrigin = await watchtowerMulti.bindPort(
      watchtowerPort,
      {
        protocol: null,
        addSsl: null,
        preferredExternalPort: watchtowerPort,
        secure: null,
      },
    )
    const watchtower = sdk.createInterface(effects, {
      name: 'Watchtower',
      id: 'watchtower',
      description: 'Allows peers to use your watchtower server',
      type: 'p2p',
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      query: {},
    })
    receipts.push(await watchtowerMultiOrigin.export([watchtower]))
  }

  return receipts
})
