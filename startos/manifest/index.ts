import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

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
  virtualNetworking: true,
  images: {
    lnd: {
      // Built from ./Dockerfile: lnd v0.21.4-beta + the lndinit binary and the
      // sqlite3 CLI, both used by the bolt → SQLite migration
      // (startos/versions/v0.21.2-beta_5.ts, startos/sqliteBackend.ts).
      source: {
        dockerBuild: {},
      },
      arch: ['aarch64', 'x86_64'],
      emulateMissing: false,
    },
  },
})
