import { setupManifest } from '@start9labs/start-sdk'
import {
  depBitcoindDescription,
  depTorDescription,
  long,
  short,
} from './i18n'

export const manifest = setupManifest({
  id: 'lnd',
  title: 'LND',
  license: 'MIT',
  packageRepo: 'https://github.com/Start9Labs/lnd-startos',
  upstreamRepo: 'https://github.com/lightningnetwork/lnd',
  marketingUrl: 'https://lightning.engineering/',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    lnd: {
      // Built from ./Dockerfile: lnd v0.21.1-beta + the lndinit binary (used by
      // the bolt → SQLite migration in startos/versions/current.ts).
      source: {
        dockerBuild: {},
      },
      arch: ['aarch64', 'x86_64'],
    },
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
