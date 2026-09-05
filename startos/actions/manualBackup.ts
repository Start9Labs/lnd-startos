import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { lndDataDir, selfGrpcHost } from '../utils'

export const manualBackup = sdk.Action.withoutInput(
  'channels-backup-test',
  async () => ({
    name: 'Channels - Test Auto-Backup',
    description:
      'Manually trigger a backup of the channel.backup file to enabled backup providers.',
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Security'),
    visibility: 'enabled',
  }),
  async ({ effects }) => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      sdk.Mounts.of().mountVolume({
        volumeId: 'main',
        subpath: null,
        mountpoint: lndDataDir,
        readonly: false,
      }),
      'manual-backup',
      async (sub) => {
        return await sub.exec([
          'sh',
          '-c',
          `lncli --rpcserver=${selfGrpcHost} exportchanbackup --all --output_file "${lndDataDir}/data/chain/bitcoin/mainnet/channel.backup"`,
        ])
      },
    )
    if (res.exitCode !== 0) {
      throw new Error(`Export failed: ${String(res.stderr)}`)
    }
    return {
      version: '1',
      title: 'Channels - Test Auto-Backup',
      message: `<span class="g-card"><header>Status: STARTED 
                  <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiMwMGZmOGEiPjx0aXRsZSB4bWxucz0iIiBmaWxsPSIjMDBmZjhhIj5iYWNrdXAtb3V0bGluZTwvdGl0bGU+PHBhdGggZmlsbD0iIzAwZmY4YSIgZD0iTTYuNSAyMHEtMi4yOCAwLTMuODktMS41N1ExIDE2Ljg1IDEgMTQuNThxMC0xLjk1IDEuMTctMy40OHExLjE4LTEuNTMgMy4wOC0xLjk1cS42My0yLjMgMi41LTMuNzJROS42MyA0IDEyIDRxMi45MyAwIDQuOTYgMi4wNFExOSA4LjA3IDE5IDExcTEuNzMuMiAyLjg2IDEuNXExLjE0IDEuMjggMS4xNCAzcTAgMS44OC0xLjMxIDMuMTlUMTguNSAyMEgxM3EtLjgyIDAtMS40MS0uNTlRMTEgMTguODMgMTEgMTh2LTUuMTVMOS40IDE0LjRMOCAxM2w0LTRsNCA0bC0xLjQgMS40bC0xLjYtMS41NVYxOGg1LjVxMS4wNSAwIDEuNzctLjczcS43My0uNzIuNzMtMS43N3QtLjczLTEuNzdRMTkuNTUgMTMgMTguNSAxM0gxN3YtMnEwLTIuMDctMS40Ni0zLjU0UTE0LjA4IDYgMTIgNlE5LjkzIDYgOC40NiA3LjQ2UTcgOC45MyA3IDExaC0uNXEtMS40NSAwLTIuNDcgMS4wM1EzIDEzLjA1IDMgMTQuNVQ0LjAzIDE3cTEuMDIgMSAyLjQ3IDFIOXYybTMtNyIvPjwvc3ZnPg==" alt="backup" width="48" height="48"></header>
                  <span class="g-secondary">The manual backup test has been triggered. The backup watcher will now begin sending the <b><span class="g-primary">channel.backup</span></b> file to your enabled backup provider(s). Check the logs to verify successful uploads or troubleshoot any failures.</span></span>`,
      result: null,
    }
  },
)
