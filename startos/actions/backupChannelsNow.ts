import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { backupAgentScript, mainMounts } from '../utils'

export const backupChannelsNow = sdk.Action.withoutInput(
  'backup-channels-now',

  async ({ effects }) => ({
    name: i18n('Back Up Channels Now'),
    description: i18n(
      'Copy channel.backup to every enabled target right now, and report what each one said.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: i18n('Backups'),
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    const res = await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'lnd' },
      mainMounts,
      'backup-channels-now',
      async (sub) => sub.exec(['sh', backupAgentScript, '--once'], {}, 180_000),
    )

    if (res.exitCode === 3) {
      return {
        version: '1' as const,
        title: i18n('Channel Backups'),
        message: i18n(
          'There is no channel.backup to copy yet. LND writes it when your first channel opens.',
        ),
        result: null,
      }
    }

    // The agent reports each target's outcome on stderr and exits non-zero if
    // any of them failed, so the action fails with the same detail the health
    // check shows rather than a generic message.
    if (res.exitCode !== 0) {
      throw new Error(
        i18n('Backup failed: ${reason}', {
          reason:
            String(res.stderr || res.stdout)
              .trim()
              .split('\n')
              .slice(-3)
              .join(' ') || i18n('The target gave no reason'),
        }),
      )
    }

    return {
      version: '1' as const,
      title: i18n('Channel Backups'),
      message: i18n('channel.backup was copied to every enabled target.'),
      result: null,
    }
  },
)
