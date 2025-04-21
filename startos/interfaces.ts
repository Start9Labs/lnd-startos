import { sdk } from './sdk'
import { lndConfFile } from './file-models/lnd.conf'
import { controlPort, peerPort, watchtowerPort } from './utils'

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
  // @TODO
  const peerMultiOrigin = await peerMulti.bindPort(peerPort, {
    protocol: null,
    addSsl: { preferredExternalPort: peerPort, alpn: null },
    preferredExternalPort: peerPort,
    secure: null,
  })
  const peer = sdk.createInterface(effects, {
    name: 'Peer Interface',
    id: 'peer',
    description: 'Used for connecting with peers',
    type: 'p2p',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    search: {},
  })
  receipts.push(await peerMultiOrigin.export([peer]))

  if ((await lndConfFile.read.const(effects))?.['watchtower.active']) {
    // watchtower
    const watchtowerMulti = sdk.MultiHost.of(effects, 'watchtower-multi')
    // @TODO
    const watchtowerMultiOrigin = await watchtowerMulti.bindPort(
      watchtowerPort,
      {
        protocol: null,
        addSsl: { preferredExternalPort: watchtowerPort, alpn: null },
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

  return receipts
})
