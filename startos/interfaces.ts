import { FileHelper } from '@start9labs/start-sdk'
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
      // lndconnect carries one DER-encoded certificate, so send the root CA
      // that anchors the chain LND serves rather than the chain itself: the
      // leaf is reissued whenever an address changes, the root never is.
      const cert = await readFile(certHostPath, 'utf8').then((pem) => {
        const chain = pem.match(
          /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
        )
        if (!chain) throw new Error(`${certHostPath} holds no certificate`)
        return Buffer.from(
          chain[chain.length - 1].replace(/-----[^-]+-----|\s/g, ''),
          'base64',
        ).toString('base64url')
      })

      // `protocol: 'https'` alone would not put the proxy in front; the addSsl
      // block is what does. See README § Network Access and Interfaces.
      const restMulti = sdk.MultiHost.of(effects, controlHostId)
      const restMultiOrigin = await restMulti.bindPort(restPort, {
        protocol: 'https',
        preferredExternalPort: restPort,
        addSsl: {
          alpn: null,
          auth: null,
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

      const gRPCMulti = sdk.MultiHost.of(effects, gRPCHostId)

      // Not addSsl like REST: an addSsl rewrap negotiates no ALPN with the
      // client, and gRPC-go rejects that ("missing selected ALPN property").
      const gRPCMultiOrigin = await gRPCMulti.bindPort(gRPCPort, {
        protocol: null,
        addSsl: null,
        preferredExternalPort: gRPCPort,
        secure: { ssl: true },
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
  const peerMulti = sdk.MultiHost.of(effects, peerHostId)
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

  // watchtower — always exported; LND only listens when watchtower.active=true
  const watchtowerMulti = sdk.MultiHost.of(effects, watchtowerHostId)
  const watchtowerMultiOrigin = await watchtowerMulti.bindPort(watchtowerPort, {
    protocol: null,
    addSsl: null,
    preferredExternalPort: watchtowerPort,
    secure: { ssl: false },
  })
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
