import { setupManifest } from '@start9labs/start-sdk'
import {
  alertInstall,
  alertRestore,
  alertUninstall,
  depBitcoindDescription,
  depTorDescription,
  long,
  short,
} from './i18n'

export const manifest = setupManifest({
  id: 'lnd',
  title: 'LND',
  license: 'MIT',
  packageRepo: 'https://github.com/Start9Labs/lnd-startos/tree/update/040',
  upstreamRepo: 'https://github.com/lightningnetwork/lnd',
  marketingUrl: 'https://lightning.engineering/',
  donationUrl: null,
  docsUrls: [
    'https://docs.start9.com/bitcoin-guides/lightning-wallets',
    'https://docs.lightning.engineering/',
  ],
  description: { short, long },
  volumes: ['main'],
  images: {
    lnd: {
      source: {
        dockerTag: 'lightninglabs/lnd:v0.20.0-beta',
      },
      arch: ['aarch64', 'x86_64'],
      emulateMissingAs: 'x86_64',
    },
  },
  alerts: {
    install: alertInstall,
    uninstall: alertUninstall,
    restore: alertRestore,
  },
  dependencies: {
    bitcoind: {
      description: depBitcoindDescription,
      optional: true,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/feec0b1dae42961a257948fe39b40caf8672fce1/dep-icon.svg',
      },
    },
    tor: {
      description: depTorDescription,
      optional: true,
      metadata: {
        title: 'Tor',
        icon: 'https://raw.githubusercontent.com/Start9Labs/tor-startos/65faea17febc739d910e8c26ff4e61f6333487a8/icon.svg',
      },
    },
  },
})
