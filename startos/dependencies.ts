import { T } from '@start9labs/start-sdk'
import { autoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { lndConfFile } from './fileModels/lnd.conf'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const conf = await lndConfFile
    .read((l) => ({
      bitcoinNode: l['bitcoin.node'],
      torActive: l['tor.active'],
    }))
    .const(effects)

  const deps: T.CurrentDependenciesResult<any> = {}

  if (conf?.torActive) {
    deps.tor = {
      kind: 'running',
      versionRange: '>=0.4.9.11:2',
      healthChecks: ['tor'],
    }
  }

  if (conf?.bitcoinNode === 'bitcoind') {
    await sdk.action.createTask(effects, 'bitcoind', autoconfig, 'critical', {
      input: {
        kind: 'partial',
        accept: [{ zmqEnabled: true }],
        set: { zmqEnabled: true },
      },
      reason: i18n('LND requires ZMQ enabled in Bitcoin'),
      when: { condition: 'input-not-matches', once: false },
    })

    deps.bitcoind = {
      kind: 'running',
      versionRange: '>=28.4:13',
      healthChecks: ['bitcoind', 'sync-progress'],
    }
  }

  return deps
})
