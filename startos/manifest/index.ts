import { setupManifest } from '@start9labs/start-sdk'
import { SDKImageInputSpec } from '@start9labs/start-sdk/base/lib/types/ManifestTypes'
import { short, long, alertInstall, alertUninstall, alertRestore } from './i18n'

const BUILD = process.env.BUILD || ''

const arch =
  BUILD === 'x86_64' || BUILD === 'aarch64' ? [BUILD] : ['x86_64', 'aarch64']

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
    'https://github.com/Start9Labs/lnd-startos/blob/update/040/instructions.md',
  description: { short, long },
  volumes: ['main'],
  images: {
    lnd: {
      source: {
        dockerTag: 'lightninglabs/lnd:v0.20.0-beta',
      },
      arch,
    } as SDKImageInputSpec,
  },
  hardwareRequirements: {
    arch,
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
        title: 'A Bitcoin Full Node',
        icon: 'https://bitcoin.org/img/icons/opengraph.png',
      },
    },
  },
})
