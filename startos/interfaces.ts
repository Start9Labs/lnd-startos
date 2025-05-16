import { sdk } from './sdk'
import { lndConfFile } from './file-models/lnd.conf'

export const controlPort = 10009
export const peerPort = 9735
export const watchtowerPort = 9911

export const peerInterfaceId = 'peer'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // control
  const controlMulti = sdk.MultiHost.of(effects, 'control-multi')
  const controlMultiOrigin = await controlMulti.bindPort(controlPort, {
    protocol: 'http',
  })
  const control = sdk.createInterface(effects, {
    name: 'Control',
    id: 'control',
    description: 'Used for REST and gRPC connections',
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    search: {},
  })
  const controlReceipt = await controlMultiOrigin.export([control])

  const receipts = [controlReceipt]

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
    search: {},
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
      search: {},
    })
    receipts.push(await watchtowerMultiOrigin.export([watchtower]))
  }

  const peerAddresses = (await sdk.serviceInterface.getOwn(effects, peerInterfaceId).const())?.addressInfo?.publicUrls

  await lndConfFile.merge(effects, { externalhosts: peerAddresses })

  return receipts
})
