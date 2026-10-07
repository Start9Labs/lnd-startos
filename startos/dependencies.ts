import { autoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { lndConfFile } from './fileModels/lnd.conf'
import { i18n } from './i18n'
import { depBitcoindDescription } from './manifest/i18n'
import { sdk } from './sdk'

const bitcoind = sdk.Dependency.optional('bitcoind', {
  description: depBitcoindDescription,
  metadata: {
    title: 'Bitcoin',
    icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/feec0b1dae42961a257948fe39b40caf8672fce1/dep-icon.svg',
  },
  versionRange: '>=28.4:17',
  kind: 'running',
  healthChecks: ['bitcoind', 'sync-progress'],
  enabled: async ({ effects }) =>
    (await lndConfFile.read((l) => l['bitcoin.node']).const(effects)) ===
    'bitcoind',
}).withInit(async (effects) => {
  await sdk.action.createTask(effects, 'bitcoind', autoconfig, 'critical', {
    input: {
      kind: 'partial',
      accept: [{ zmqEnabled: true }],
      set: { zmqEnabled: true },
    },
    reason: i18n('LND requires ZMQ enabled in Bitcoin'),
    when: { condition: 'input-not-matches', once: false },
  })
})

const tor = sdk.Dependency.optional('tor', {
  description: null,
  metadata: {
    title: 'Tor',
    icon: 'https://raw.githubusercontent.com/Start9Labs/tor-startos/65faea17febc739d910e8c26ff4e61f6333487a8/icon.svg',
  },
  versionRange: '^0.4.9.11:4',
  kind: 'running',
  healthChecks: ['tor'],
  enabled: async ({ effects }) =>
    !!(await lndConfFile.read((l) => l['tor.active']).const(effects)),
})

export const dependencies = sdk.Dependencies.of()
  .addDependency(bitcoind)
  .addDependency(tor)
