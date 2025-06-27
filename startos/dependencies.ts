import { lndConfFile } from './fileModels/lnd.conf'
import { sdk } from './sdk'
import { config } from 'bitcoind-startos/startos/actions/config/other'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const { 'bitcoin.node': bitcoinNode } = (await lndConfFile
    .read()
    .const(effects))!

  if (bitcoinNode === 'bitcoind') {
    await sdk.action.createTask(effects, 'bitcoind', config, 'critical', {
      input: { kind: 'partial', value: { zmqEnabled: true } },
      reason: 'LND requires ZMQ enabled in Bitcoin',
      when: { condition: 'input-not-matches', once: false },
      replayId: 'enable-zmq',
    })

    return {
      bitcoind: {
        healthChecks: ['sync-progress'],
        kind: 'running',
        versionRange: '>=28.1:3-alpha.4',
      },
    }
  }
  return {}
})
