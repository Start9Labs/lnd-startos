import { i18n } from './i18n'
import { lndConfFile } from './fileModels/lnd.conf'
import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { otherConfig } from 'bitcoind-startos/startos/actions/config/other'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const { 'bitcoin.node': bitcoinNode } = (await lndConfFile
    .read()
    .const(effects))!

  const bitcoinSelected = await storeJson.read(e => e.bitcoindSelected).const(effects)

  if (bitcoinNode === 'bitcoind' && bitcoinSelected) {
    await sdk.action.createTask(effects, 'bitcoind', otherConfig, 'critical', {
      input: { kind: 'partial', value: { zmqEnabled: true } },
      reason: i18n('LND requires ZMQ enabled in Bitcoin'),
      when: { condition: 'input-not-matches', once: false },
      replayId: 'enable-zmq',
    })

    return {
      bitcoind: {
        healthChecks: ['sync-progress', 'primary'],
        kind: 'running',
        versionRange: '>=29.1:2-beta.0',
      },
    }
  }
  return {}
})
