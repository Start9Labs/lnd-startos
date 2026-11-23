import { T } from '@start9labs/start-sdk'
import { autoconfig } from 'bitcoin-core-startos/startos/actions/config/autoconfig'
import { apis } from 'rbitcoin-startos/startos/actions/apis'
import { storage } from 'rbitcoin-startos/startos/actions/storage'
import { lndConfFile } from './fileModels/lnd.conf'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { depBitcoindDescription, depRbitcoinDescription } from './manifest/i18n'
import { sdk } from './sdk'

// The service behind `bitcoin.node=bitcoind`, or null on Neutrino.
const localNode = async (effects: T.Effects) => {
  const node = await lndConfFile.read((l) => l['bitcoin.node']).const(effects)
  if (node !== 'bitcoind') return null
  return (
    (await storeJson.read((s) => s.bitcoinNode).const(effects)) ?? 'bitcoind'
  )
}

const bitcoind = sdk.Dependency.optional('bitcoind', {
  description: depBitcoindDescription,
  metadata: {
    title: 'Bitcoin',
    icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/feec0b1dae42961a257948fe39b40caf8672fce1/dep-icon.svg',
  },
  versionRange:
    '(>=28.4:42 && <29) || (>=29.5:4 && <30) || (>=30.4:4 && <31) || >=31.2:4 || >=#knotsprerdts:29.3:33 || >=#roots:29.4:1',
  kind: 'running',
  healthChecks: ['bitcoind', 'sync-progress'],
  enabled: async ({ effects }) => (await localNode(effects)) === 'bitcoind',
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

// 0.9.2:1 is the first version with the `public` volume. A pruned rbitcoin is
// refused: LND never finishes its restart there (rbitcoin-org/rbitcoin#1901).
const rbitcoin = sdk.Dependency.optional('rbitcoin', {
  description: depRbitcoinDescription,
  metadata: {
    title: 'rbitcoin',
    icon: 'https://raw.githubusercontent.com/remcoros/rbitcoin-startos/refs/heads/main/icon.png',
  },
  versionRange: '>=0.9.2:1 && <0.10.0:0',
  kind: 'running',
  healthChecks: ['rpc', 'synchronization'],
  enabled: async ({ effects }) => (await localNode(effects)) === 'rbitcoin',
}).withInit(async (effects) => {
  const rpc = { rpc: { selection: 'enabled' as const } }
  await sdk.action.createTask(effects, 'rbitcoin', apis, 'critical', {
    input: { kind: 'partial', accept: [rpc], set: rpc },
    when: { condition: 'input-not-matches', once: false },
    reason: i18n('Enable the rbitcoin RPC API that LND reads from'),
  })
  const archival = { pruning: { selection: 'disabled' as const } }
  await sdk.action.createTask(effects, 'rbitcoin', storage, 'critical', {
    input: { kind: 'partial', accept: [archival], set: archival },
    when: { condition: 'input-not-matches', once: false },
    reason: i18n('LND needs rbitcoin to keep the full chain history'),
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
  .addDependency(rbitcoin)
  .addDependency(tor)
