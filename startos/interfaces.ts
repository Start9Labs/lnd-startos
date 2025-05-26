import { sdk } from './sdk'
import { lndConfFile } from './fileModels/lnd.conf'
import { lndDataDir, mainMounts } from './utils'
import { readFile } from 'fs/promises'
import { FileHelper } from '@start9labs/start-sdk'

export const restPort = 8080
export const peerPort = 9735
export const watchtowerPort = 9911

export const peerInterfaceId = 'peer'
export const controlInterfaceId = 'control'
export const lndConnectId = 'lnd-connect'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  // REST
  try {
    const { mac, cert } = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'get-connection-info',
      async (subc) => {
        const macPath = `${subc.rootfs}${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`
        await FileHelper.string(macPath).read().const(effects)
        const cert = await FileHelper.string(
          `${subc.rootfs}${lndDataDir}/tls.cert`,
        )
          .read()
          .const(effects)
        const mac = await readFile(macPath).then((buf) =>
          Buffer.from(buf).toString('base64url'),
        )
        return { mac, cert }
      },
    )

    const restMulti = sdk.MultiHost.of(effects, 'rest-multi')
    const restMultiOrigin = await restMulti.bindPort(restPort, {
      protocol: 'http',
      preferredExternalPort: restPort,
    })
    console.log('Hex Mac:\n', Buffer.from(mac).toString('base64url'))

    const lndConnect = sdk.createInterface(effects, {
      name: 'REST LND Connect',
      id: lndConnectId,
      description: 'Used for REST connections',
      type: 'api',
      masked: false,
      schemeOverride: { ssl: 'lndconnect', noSsl: 'lndconnect' },
      username: null,
      path: '',
      query: {
        macaroon: mac,
      },
    })
    const restReceipt = await restMultiOrigin.export([lndConnect])
    receipts.push(restReceipt)
  } catch {
    console.log('admin.macaroon not found')
  }
  // TODO expose gRPC?

  // peer
  const peerMulti = sdk.MultiHost.of(effects, 'peer-multi')
  const peerMultiOrigin = await peerMulti.bindPort(peerPort, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: peerPort,
    secure: null,
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
