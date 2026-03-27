import { FileHelper } from '@start9labs/start-sdk'
import { readFile } from 'fs/promises'
import { lndConfFile } from './fileModels/lnd.conf'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const gRPCPort = 10009
export const restPort = 8080
export const peerPort = 9735
export const watchtowerPort = 9911

export const peerInterfaceId = 'peer'
export const gRPCInterfaceId = 'grpc'
export const controlInterfaceId = 'control'
export const lndconnectRestId = 'lnd-connect-rest'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  // Stable host paths — the SDK mounts volumes from /media/startos/volumes/<volumeId>,
  // so these paths persist independently of any SubContainer lifetime.
  // Using const(effects) inside withTemp registers a watch on the temp rootfs path,
  // which is deleted on teardown — the watch never fires, so setInterfaces never re-runs.
  const macHostPath =
    '/media/startos/volumes/main/data/chain/bitcoin/mainnet/admin.macaroon'
  const certHostPath = '/media/startos/volumes/main/tls.cert'

  // Register reactive dependencies on stable paths: triggers setInterfaces re-run
  // when the macaroon appears (e.g. after wallet unlock on first install).
  const macExists =
    (await FileHelper.string(macHostPath).read().const(effects)) !== null

  // REST and gRPC
  if (macExists) {
    try {
      const macaroon = await readFile(macHostPath).then((buf) =>
        buf.toString('base64url'),
      )
      const cert = await readFile(certHostPath).then((buf) =>
        buf.toString('base64url'),
      )

      const restMulti = sdk.MultiHost.of(effects, 'control')
      const restMultiOrigin = await restMulti.bindPort(restPort, {
        protocol: 'https',
        preferredExternalPort: restPort,
        addSsl: {
          alpn: null,
          preferredExternalPort: restPort,
          addXForwardedHeaders: false,
        },
      })

      const lndConnect = sdk.createInterface(effects, {
        name: i18n('REST LND Connect'),
        id: lndconnectRestId,
        description: i18n('Used for REST connections'),
        type: 'api',
        masked: true,
        schemeOverride: { ssl: 'lndconnect', noSsl: 'lndconnect' },
        username: null,
        path: '',
        query: {
          macaroon,
        },
      })
      const restReceipt = await restMultiOrigin.export([lndConnect])
      receipts.push(restReceipt)

      const gRPCMulti = sdk.MultiHost.of(effects, 'grpc')
      const gRPCMultiOrigin = await gRPCMulti.bindPort(gRPCPort, {
        protocol: 'https',
        preferredExternalPort: gRPCPort,
        addSsl: {
          alpn: null,
          preferredExternalPort: gRPCPort,
          addXForwardedHeaders: false,
        },
      })

      const lndgRpcConnect = sdk.createInterface(effects, {
        name: i18n('gRPC LND Connect'),
        id: gRPCInterfaceId,
        description: i18n('Used for gRPC connections'),
        type: 'api',
        masked: true,
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
    } catch (e) {
      console.log('Error reading macaroon/cert:', e)
    }
  } else {
    console.log('waiting for admin.macaroon to be created...')
  }

  // peer
  const peerMulti = sdk.MultiHost.of(effects, 'peer')
  const peerMultiOrigin = await peerMulti.bindPort(peerPort, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: peerPort,
    secure: { ssl: false },
  })
  const peer = sdk.createInterface(effects, {
    name: i18n('Peer Interface'),
    id: peerInterfaceId,
    description: i18n('Used for connecting with peers'),
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
    const watchtowerMulti = sdk.MultiHost.of(effects, 'watchtower')
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
      name: i18n('Watchtower'),
      id: 'watchtower',
      description: i18n('Allows peers to use your watchtower server'),
      type: 'p2p',
      masked: true,
      schemeOverride: null,
      username: null,
      path: '',
      query: {},
    })
    receipts.push(await watchtowerMultiOrigin.export([watchtower]))
  }

  return receipts
})
