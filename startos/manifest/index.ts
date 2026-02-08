import { setupManifest } from '@start9labs/start-sdk'
import { short, long, alertInstall, alertUninstall, alertRestore, depBitcoindTitle } from './i18n'

export const manifest = setupManifest({
  id: 'lnd',
  title: 'LND',
  license: 'mit',
  wrapperRepo: 'https://github.com/Start9Labs/lnd-startos',
  upstreamRepo: 'https://github.com/lightningnetwork/lnd',
  supportSite: 'https://lightning.engineering/slack.html',
  marketingSite: 'https://lightning.engineering/',
  donationUrl: 'https://donate.start9.com/',
  docsUrl:
    'https://docs.lightning.engineering/',
  description: { short, long },
  volumes: ['main'],
  images: {
    lnd: {
      source: {
        dockerTag: 'lightninglabs/lnd:v0.20.0-beta',
      },
      arch: ['aarch64', 'x86_64'],
      emulateMissingAs: 'aarch64'
    },
  },
  alerts: {
    install: alertInstall,
    update: null,
    uninstall: alertUninstall,
    restore: alertRestore,
    start: null,
    stop: null,
  },
  dependencies: {
    bitcoind: {
      description: 'Used to subscribe to new block events.',
      optional: true,
      metadata: {
        title: depBitcoindTitle,
        icon: 'https://bitcoin.org/img/icons/opengraph.png',
      },
    },
  },
})
