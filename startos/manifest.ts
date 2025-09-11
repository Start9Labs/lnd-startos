import { setupManifest } from '@start9labs/start-sdk'
import { SDKImageInputSpec } from '@start9labs/start-sdk/base/lib/types/ManifestTypes'

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
  description: {
    short:
      'A complete implementation of a Lightning Network node by Lightning Labs',
    long: 'Lightning Network Daemon (LND) fully conforms to the Lightning Network specification (BOLTs). BOLT stands for: Basis of Lightning Technology. In the current state lnd is capable of: creating channels, closing channels, managing all channel states (including the exceptional ones!), maintaining a fully authenticated+validated channel graph, performing path finding within the network, passively forwarding incoming payments, sending outgoing onion-encrypted payments through the network, updating advertised fee schedules, and automatic channel management (autopilot).',
  },
  volumes: ['main'],
  images: {
    lnd: {
      source: {
        dockerTag: 'lightninglabs/lnd:v0.19.2-beta',
      },
      arch,
    } as SDKImageInputSpec,
  },
  hardwareRequirements: {
    arch,
  },
  alerts: {
    install:
      'READ CAREFULLY! LND and the Lightning Network are considered beta software. Please use with caution and do not risk more money than you are willing to lose. We encourage frequent backups, particularly after opening or closing channels. If for any reason, you need to restore LND from a backup, your on-chain wallet will be restored. Any channels in the backup will be closed and their funds returned to your on-chain wallet, minus fees. It may also take some time for this process to occur. Any channels opened after the last backup CANNOT be recovered by backup restore.',
    update: null,
    uninstall:
      'READ CAREFULLY! Uninstalling LND will result in permanent loss of data, including its private keys for its on-chain wallet and all channel states. Please make a backup if you have any funds in your on-chain wallet or in any channels. Recovering from backup will restore your on-chain wallet, but due to the architecture of the Lightning Network, your channels cannot be recovered. All channels included in the backup will be closed and their funds returned to your on-chain wallet, minus fees. Any channels opened after the last backup CANNOT be recovered by backup restore',
    restore:
      'READ CAREFULLY! Any channels opened since the last backup will be forgotten and may linger indefinitely, and channels contained in the backup will be closed and their funds returned to your on-chain wallet, minus fees. After all recoverable funds are available in your on-chain wallet, all funds should be swept to a different wallet. NEVER use a restored LND wallet to open new channels. If you would like to use LND after a backup restore you will first need to sweep all on-chain funds to a different wallet, next LND can be safely uninstalled, and finally LND can be installed fresh from the marketplace.',
    start: null,
    stop: null,
  },
  dependencies: {
    bitcoind: {
      description: 'Used to subscribe to new block events.',
      optional: true,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://bitcoin.org/img/icons/opengraph.png?1749679667',
      },
    },
  },
})
