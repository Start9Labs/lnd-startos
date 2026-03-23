import { T } from '@start9labs/start-sdk'
import { autoconfig } from 'bitcoind-startos/startos/actions/config/autoconfig'
import { lndConfFile } from './fileModels/lnd.conf'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const conf = await lndConfFile
    .read((l) => ({
      bitcoinNode: l['bitcoin.node'],
      useTorOnly: l['tor.skip-proxy-for-clearnet-targets'] === false,
    }))
    .const(effects)

  const deps: T.CurrentDependenciesResult<any> = {}

  if (conf?.useTorOnly) {
    deps.tor = {
      kind: 'running',
      versionRange: '>=0.4.9.5:0-beta.4',
      healthChecks: ['tor'],
    }
  }

  if (conf?.bitcoinNode === 'bitcoind') {
    await sdk.action.createTask(effects, 'bitcoind', autoconfig, 'critical', {
      input: { kind: 'partial', value: { zmqEnabled: true } },
      reason: i18n('LND requires ZMQ enabled in Bitcoin'),
      when: { condition: 'input-not-matches', once: false },
    })

    deps.bitcoind = {
      kind: 'running',
      versionRange: '>=30.2:5-beta.4',
      healthChecks: ['bitcoind', 'sync-progress'],
    }
  }

  return deps
})
