import { sdk } from './sdk'
import { configSpec } from './config/spec'

// It is good practice to abstract these two variables from each interface, as they may be used elsewhere in the package codebase or by dependent packages.
export const controlPort = 10009
export const controlInterfaceId = 'control'
export const peerPort = 9735
export const peerInterfaceId = 'peer'
export const watchtowerPort = 9911
export const watchtowerInterfaceId = 'watchtower'

/**
 * ======================== Service Interfaces ========================
 *
 * Here we decide how the service will be exposed to the outside world.
 *
 * This function runs on install, update, and config save.
 */
export const setInterfaces = sdk.setupInterfaces(
  configSpec,
  async ({ effects, input }) => {
    const controlMulti = sdk.host.multi(effects, 'control-multi')
    const controlMultiOrigin = await controlMulti.bindPort(controlPort, { protocol: 'http' })
    const control = sdk.createInterface(effects, {
      name: 'Control Interface',
      id: controlInterfaceId,
      description: 'Specifies the interfaces to listen on for gRPC and REST connections.',
      type: 'api',
      hasPrimary: false,
      disabled: false,
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      search: {},
    })

    const controlReceipt = await controlMultiOrigin.export([control])
    const receipts = [controlReceipt]

    const peerMulti = sdk.host.multi(effects, 'peer-multi')
    const peerMultiOrigin = await peerMulti.bindPort(peerPort, { protocol: 'lightning' })
    const peer = sdk.createInterface(effects, {
      name: 'peer Interface',
      id: peerInterfaceId,
      description: 'Specifies the interfaces to listen on for p2p connections.',
      type: 'p2p',
      hasPrimary: false,
      disabled: false,
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      search: {},
    })

    const peerReceipt = await peerMultiOrigin.export([peer])
    receipts.push(peerReceipt)

    // TODO Expose watchtower only if enabled in config
    const watchtowerMulti = sdk.host.multi(effects, 'watchtower-multi')
    const watchtowerMultiOrigin = await watchtowerMulti.bindPort(watchtowerPort, { protocol: 'lightning' })
    const watchtower = sdk.createInterface(effects, {
      name: 'watchtower Interface',
      id: watchtowerInterfaceId,
      description: 'Specifies the interfaces to listen on for p2p connections.',
      type: 'p2p',
      hasPrimary: false,
      disabled: false,
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      search: {},
    })

    const watchtowerReceipt = await peerMultiOrigin.export([watchtower])
    receipts.push(watchtowerReceipt)


    return receipts
  },
)
