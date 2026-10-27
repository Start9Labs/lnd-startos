import { base64 } from 'rfc4648'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  literal,
  mainMounts,
  selfGrpcHost,
  unopenableChannelBackup,
} from '../utils'
import { serverActiveWithin } from '../walletUnlocker'

const { InputSpec, Value } = sdk

export const restoreChannelsFromFile = sdk.Action.withInput(
  'restore-channels-from-file',

  async ({ effects }) => ({
    name: i18n('Restore Channels from File'),
    description: i18n(
      'Recover the channels in a channel.backup you hold, such as an emailed copy.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Continuous Backups'),
    visibility: 'enabled',
  }),

  InputSpec.of({
    backup: Value.textarea({
      name: i18n('Channel Backup (base64)'),
      description: i18n(
        'On macOS or Linux, base64 < channel.backup prints it. On Windows, certutil -encode channel.backup channel.txt writes it to channel.txt; paste the whole of that file.',
      ),
      required: true,
      default: null,
    }),
    confirmed: Value.toggle({
      name: i18n(
        'I understand peers will force-close every channel this recovers',
      ),
      description: null,
      warning: i18n(
        'Lightning Labs strongly recommends against continuing to use a LND node after running restorechanbackup. Please recover and sweep any remaining funds to another wallet. Afterwards LND should be uninstalled. LND can then be re-installed fresh if you would like to continue using LND.',
      ),
      default: false,
    }),
  }),

  async () => ({}),

  async ({ effects, input }) => {
    if (!input.confirmed) {
      throw new Error(
        i18n(
          'Confirm that peers will force-close every channel this recovers.',
        ),
      )
    }
    let file: Uint8Array
    try {
      file = base64.parse(
        input.backup.replace(/-----(BEGIN|END) [^-]*-----|\s/g, ''),
      )
    } catch {
      throw new Error(
        i18n(
          'That is not base64. Paste all of what base64 or certutil printed.',
        ),
      )
    }
    if (!(await serverActiveWithin(30_000))) {
      throw new Error(
        i18n(
          'LND has not finished starting: it restores channels only once it has caught up with the chain. Try again later.',
        ),
      )
    }
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'restore-channels-from-file',
      async (subc) => {
        await subc.writeFile('/tmp/channel.backup', file)
        return subc.exec(
          [
            'lncli',
            `--rpcserver=${selfGrpcHost}`,
            'restorechanbackup',
            '--multi_file',
            '/tmp/channel.backup',
          ],
          { timeout: 60_000 },
        )
      },
    )
    if (res.exitCode !== 0) {
      const reason = String(res.stderr).trim()
      throw new Error(
        unopenableChannelBackup.test(reason)
          ? i18n(
              'LND could not open this channel.backup: it was made under another seed, or it is damaged. Nothing was restored.',
            )
          : i18n('LND reported an error during the restore: ${error}', {
              error: literal(res.timedOutAfter ? i18n('timed out') : reason),
            }),
      )
    }
    const { num_restored }: { num_restored: number } = JSON.parse(
      String(res.stdout),
    )
    return {
      version: '1',
      title: i18n('Restore Channels from File'),
      message: num_restored
        ? i18n(
            'Channels recovered: ${count}. LND is asking their peers to force-close them; the funds return to your on-chain wallet once the closes confirm.',
            { count: num_restored },
          )
        : i18n(
            'Every channel in this file is already known to LND, so nothing was restored.',
          ),
      result: null,
    }
  },
)
