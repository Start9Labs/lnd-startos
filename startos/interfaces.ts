import { FileHelper, T } from '@start9labs/start-sdk'
import { readFile } from 'fs/promises'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const gRPCPort = 10009
export const restPort = 8080
export const peerPort = 9735
export const watchtowerPort = 9911

// Host ids (the `sdk.MultiHost.of` groups) — distinct from the interface ids
// exported on them. Used for `sdk.host.getOwn`/`get` lookups.
export const controlHostId = 'control'
export const gRPCHostId = 'grpc'
export const peerHostId = 'peer'
export const watchtowerHostId = 'watchtower'

// Interface ids (the exported service interfaces on the hosts above).
export const peerInterfaceId = 'peer'
export const gRPCInterfaceId = 'grpc'
export const controlInterfaceId = 'control'
export const lndconnectRestId = 'lnd-connect-rest'
export const watchtowerInterfaceId = 'watchtower'

// `protocol: 'https'` alone would not put the proxy in front; the addSsl
// block is what does. See README § Network Access and Interfaces.
async function bindControlPort(effects: T.Effects) {
  return sdk.MultiHost.of(effects, controlHostId).bindPort(restPort, {
    protocol: 'https',
    preferredExternalPort: restPort,
    addSsl: {
      alpn: null,
      auth: null,
      preferredExternalPort: restPort,
      addXForwardedHeaders: false,
    },
  })
}

export const setupControlBinding = sdk.setupOnInit(async (effects) => {
  await bindControlPort(effects)
})

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const restMultiOrigin = await bindControlPort(effects)
  // Not addSsl like REST: an addSsl rewrap negotiates no ALPN with the
  // client, and gRPC-go rejects that ("missing selected ALPN property").
  const gRPCMultiOrigin = await sdk.MultiHost.of(effects, gRPCHostId).bindPort(
    gRPCPort,
    {
      protocol: null,
      addSsl: null,
      preferredExternalPort: gRPCPort,
      secure: { ssl: true },
    },
  )
  const peerMultiOrigin = await sdk.MultiHost.of(effects, peerHostId).bindPort(
    peerPort,
    {
      protocol: null,
      addSsl: null,
      preferredExternalPort: peerPort,
      secure: { ssl: false },
    },
  )
  const watchtowerMultiOrigin = await sdk.MultiHost.of(
    effects,
    watchtowerHostId,
  ).bindPort(watchtowerPort, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: watchtowerPort,
    secure: { ssl: false },
  })
  const receipts = []

  // Stable host paths — the SDK mounts volumes from /media/startos/volumes/<volumeId>,
  // so these paths persist independently of any SubContainer lifetime.
  // Using const(effects) inside withTemp registers a watch on the temp rootfs path,
  // which is deleted on teardown — the watch never fires, so setInterfaces never re-runs.
  const macHostPath =
    '/media/startos/volumes/main/data/chain/bitcoin/mainnet/admin.macaroon'

  // A macaroon root-key rotation deletes the file before re-baking it, so react
  // to a replacement and never to the gap.
  const macExists =
    (await FileHelper.string(macHostPath)
      .read(
        (macaroon) => macaroon,
        (prev, next) => next === null || prev === next,
      )
      .const(effects)) !== null

  // REST and gRPC
  if (macExists) {
    try {
      const macaroon = await readFile(macHostPath).then((buf) =>
        buf.toString('base64url'),
      )
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

      // lndconnect carries one DER-encoded certificate, so send the root CA
      // that anchors the chain LND serves — it never rotates, unlike the leaf.
      const rootCa = await sdk.getRootCa(effects)
      const cert = Buffer.from(
        rootCa.replace(/-----[^-]+-----|\s/g, ''),
        'base64',
      ).toString('base64url')

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
      console.log('Error exporting LND Connect interfaces:', e)
    }
  } else {
    console.log('waiting for admin.macaroon to be created...')
  }

  // peer
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

  // watchtower — always exported; LND only listens when watchtower.active=true
  const watchtower = sdk.createInterface(effects, {
    name: i18n('Watchtower'),
    id: watchtowerInterfaceId,
    description: i18n('Allows peers to use your watchtower server'),
    type: 'p2p',
    masked: true,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await watchtowerMultiOrigin.export([watchtower]))

  return receipts
})
