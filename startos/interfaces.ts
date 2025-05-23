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
  const { mac, cert } = await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'lnd' },
    mainMounts,
    'get-connection-info',
    async (subc) => {
      const mac = await FileHelper.string(
        `${subc.rootfs}${lndDataDir}/data/chain/bitcoin/mainnet/admin.macaroon`,
      )
        .read()
        .const(effects)
      const cert = await FileHelper.string(
        `${subc.rootfs}${lndDataDir}/tls.cert`,
      )
        .read()
        .const(effects)
      return { mac, cert }
    },
  )

  if (mac && cert) {
    // REST
    const controlMulti = sdk.MultiHost.of(effects, 'control-multi')
    const controlMultiOrigin = await controlMulti.bindPort(restPort, {
      protocol: 'http',
      addSsl: { alpn: null },
      preferredExternalPort: restPort,
    })
    console.log('Hex Mac:\n', Buffer.from(mac).toString('hex'))

    const lndConnect = sdk.createInterface(effects, {
      name: 'REST LND Connect',
      id: lndConnectId,
      description: 'Used for REST connections',
      type: 'api',
      masked: true,
      schemeOverride: { ssl: 'lndconnect', noSsl: null },
      username: null,
      path: '',
      query: {
        macaroon: mac
          ? Buffer.from(mac).toString('base64url')
          : 'Error fetching admin.macaroon',
      },
    })
    const controlReceipt = await controlMultiOrigin.export([lndConnect])
    receipts.push(controlReceipt)

    // TODO expose gRPC?
  }

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

  // const peerAddresses = (
  //   await sdk.serviceInterface.getOwn(effects, peerInterfaceId).const()
  // )?.addressInfo?.publicUrls
  // const controlAddresses = (
  //   await sdk.serviceInterface.getOwn(effects, controlInterfaceId).const()
  // )?.addressInfo?.publicUrls

  // const containerIp = await sdk.getContainerIp(effects).once()
  // console.log("controlAddresses: ", controlAddresses)
  // console.log("rpclisten: ", [...(controlAddresses ?? []), `${containerIp}:10009`].flat())

  // await lndConfFile.merge(effects, {
  //   externalhosts: peerAddresses,
  //   rpclisten: `${containerIp}:10009`,
  //   restlisten: `${containerIp}:8080`,
  // })
  // await lndConfFile.merge(effects, {
  //   externalhosts: peerAddresses,
  //   rpclisten: [...(controlAddresses?.map((e) => `${e}:10009`) ?? []), `${containerIp}:10009`].flat(),
  //   restlisten: [...(controlAddresses?.map((e) => `${e}:8080`) ?? []), `${containerIp}:8080`].flat(),
  // })

  return receipts
})
